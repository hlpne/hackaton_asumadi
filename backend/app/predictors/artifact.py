"""Example local model adapter. All artifact/feature details stay in this module.

This is a calendar-feature integration example, not the hackathon baseline.
Only load pickle files supplied by a trusted model author.
"""

import os
import pickle
from numbers import Real
from pathlib import Path
from threading import Lock
from typing import Literal

from pydantic import Field

from app.schemas import (
    ContractModel, ForecastPoint, ForecastRequest, ForecastResponse, Horizon,
    RESOLUTIONS, SeriesKey,
)

ROOT = Path(__file__).resolve().parents[3]
FEATURE_NAMES = [
    "route_id", "stop_id", "direction_id", "horizon",
    "hour", "weekday", "month", "day", "lead_hours",
]
CAT_FEATURES = [0, 1, 2, 3]


class ArtifactMetadata(ContractModel):
    feature_schema: Literal["tram-calendar-v1"]
    model_version: str = Field(min_length=1)
    value_unit: str = Field(min_length=1)
    aggregation: Literal["demo_mean", "sum", "mean", "max", "last"]
    is_mock: bool
    supported_horizons: list[Horizon] = Field(min_length=1)


def feature_rows(request: ForecastRequest) -> list[list[str | int | float]]:
    """One row per output interval, in training column order; calendar is MSK.

    JSON-like encodings distinguish an absent ID from every nonempty real ID.
    Labels must already represent the requested interval's target/aggregation.
    """
    import json

    return [[
        request.route_id,
        json.dumps(request.stop_id, ensure_ascii=False),
        json.dumps(request.direction_id),
        request.horizon.value,
        timestamp.hour, timestamp.weekday(), timestamp.month, timestamp.day,
        (timestamp - request.forecast_origin).total_seconds() / 3600,
    ] for timestamp in request.timestamps()]


class ArtifactPredictor:
    def __init__(self, model, metadata: ArtifactMetadata):
        if not callable(getattr(model, "predict", None)):
            raise TypeError("Model must provide predict(rows)")
        names = getattr(model, "feature_names_", None)
        if names is not None and list(names) != FEATURE_NAMES:
            raise ValueError("Model features do not match tram-calendar-v1")
        self._model = model
        self._metadata = metadata
        # A pickle may contain an estimator that is not safe for concurrent calls.
        self._lock = Lock()

    def predict(self, request: ForecastRequest) -> ForecastResponse:
        if request.horizon not in self._metadata.supported_horizons:
            raise RuntimeError("Configured model does not support the requested horizon")
        with self._lock:
            values = list(self._model.predict(feature_rows(request)))
        timestamps = request.timestamps()
        if len(values) != len(timestamps):
            raise ValueError("Model must return exactly one prediction per interval")
        # Reject multi-output arrays, strings and booleans instead of coercing them.
        if any(isinstance(value, bool) or not isinstance(value, Real) for value in values):
            raise ValueError("Model predictions must be a one-dimensional numeric sequence")
        return ForecastResponse(
            series_key=SeriesKey(
                route_id=request.route_id, stop_id=request.stop_id,
                direction_id=request.direction_id,
            ),
            horizon=request.horizon, resolution=RESOLUTIONS[request.horizon],
            forecast_origin=request.forecast_origin,
            value_unit=self._metadata.value_unit,
            aggregation=self._metadata.aggregation,
            is_mock=self._metadata.is_mock,
            model_version=self._metadata.model_version,
            # A point model does not supply calibrated intervals.
            points=[ForecastPoint(timestamp=timestamp, predicted_load=float(value))
                    for timestamp, value in zip(timestamps, values, strict=True)],
        )


def _configured_path(name: str) -> Path:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required for the artifact predictor")
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT / path


def build_predictor() -> ArtifactPredictor:
    """Load once per application instance/worker; never on each HTTP request."""
    model_path = _configured_path("MODEL_PATH")
    metadata = ArtifactMetadata.model_validate_json(
        _configured_path("MODEL_METADATA_PATH").read_text(encoding="utf-8")
    )
    if not model_path.is_file():
        raise FileNotFoundError(f"Model artifact does not exist: {model_path}")
    if model_path.suffix.lower() == ".cbm":
        # Optional import: the default mock has no CatBoost dependency.
        from catboost import CatBoostRegressor

        model = CatBoostRegressor(thread_count=1)
        model.load_model(str(model_path), format="cbm")
    elif model_path.suffix.lower() == ".pkl":
        with model_path.open("rb") as stream:
            model = pickle.load(stream)
    else:
        raise ValueError("MODEL_PATH must point to a .cbm or .pkl file")
    return ArtifactPredictor(model, metadata)

"""Serve the archived final route-hour forecasts without inventing stop estimates.

The supplied LightGBM ensemble needs historical labels to construct its lag features.
Those labels were not included in tram_final.zip, so the verified final output CSV is
the deployable inference artifact for its fixed November–December 2025 window.
"""

import csv
from datetime import date, datetime
from pathlib import Path

from app.config import ROOT, Settings
from app.predictors.mock import MockPredictor
from app.schedule import PostgresSchedule
from app.schemas import ForecastPoint, ForecastRequest, ForecastResponse, Horizon, MOSCOW, SeriesKey

DATA_PATH = ROOT / "backend" / "data" / "tram_final_submission.csv"
FIRST_DAY = date(2025, 11, 1)
LAST_DAY = date(2025, 12, 31)
MODEL_VERSION = "tram-final-2025-0.90461"
SUPPORTED_ROUTES = frozenset({"1", "7", "11", "12", "17", "25", "26", "28", "50"})


class TramFinalPredictor:
    def __init__(self, path: Path = DATA_PATH, fallback: MockPredictor | None = None) -> None:
        self._fallback = fallback or MockPredictor()
        self._hourly: dict[tuple[str, date, int], int] = {}
        with path.open(newline="", encoding="utf-8") as stream:
            reader = csv.DictReader(stream, delimiter=";")
            if reader.fieldnames != ["route", "date", "hour", "prediction"]:
                raise ValueError("Unexpected tram_final submission schema")
            for row in reader:
                route = row["route"]
                if route not in SUPPORTED_ROUTES:
                    continue  # Route 5 has no training target in this project.
                day = date.fromisoformat(row["date"])
                hour = int(row["hour"])
                value = int(row["prediction"])
                if not FIRST_DAY <= day <= LAST_DAY or not 0 <= hour < 24 or value < 0:
                    raise ValueError("Invalid tram_final forecast row")
                key = (route, day, hour)
                if key in self._hourly:
                    raise ValueError("Duplicate tram_final forecast row")
                self._hourly[key] = value
        if len(self._hourly) != len(SUPPORTED_ROUTES) * 61 * 24:
            raise ValueError("Incomplete tram_final forecast artifact")

    def predict(self, request: ForecastRequest) -> ForecastResponse:
        # The archive has no stop- or direction-level labels. Keep the existing
        # map functional, but retain mock metadata so its values are unmistakable.
        if request.stop_id is not None or request.direction_id is not None:
            return self._fallback.predict(request)
        route = request.route_id.removeprefix("demo-")
        if route not in SUPPORTED_ROUTES:
            raise RuntimeError("No trained forecast for this route")
        if request.resolution not in {"PT1H", "P1D"} or request.horizon == Horizon.YEAR:
            raise RuntimeError("The archived model supports hourly and daily forecasts only")
        if request.start.date() < FIRST_DAY or request.end > datetime(2026, 1, 1, tzinfo=MOSCOW):
            raise RuntimeError("The archived model covers only 2025-11-01 through 2025-12-31")
        # forecast_origin is the API's selected query window anchor. It does not
        # retrain this fixed archive; its source cutoff is documented separately.
        if request.start.minute or request.start.second or request.end.minute or request.end.second:
            raise RuntimeError("The archived model has no sub-hour forecasts")
        if request.resolution == "P1D" and (request.start.hour or request.end.hour):
            raise RuntimeError("Daily forecasts must start and end at midnight")

        points = []
        for timestamp in request.timestamps():
            if request.resolution == "PT1H":
                value = self._hourly[(route, timestamp.date(), timestamp.hour)]
            else:
                value = sum(self._hourly[(route, timestamp.date(), hour)] for hour in range(24))
            points.append(ForecastPoint(timestamp=timestamp, predicted_load=value))
        return ForecastResponse(
            series_key=SeriesKey(route_id=request.route_id, stop_id=None, direction_id=None),
            horizon=request.horizon, resolution=request.resolution,
            forecast_origin=request.forecast_origin, value_unit="validations",
            aggregation="sum", is_mock=False, model_version=MODEL_VERSION,
            points=points,
        )


def build_predictor() -> TramFinalPredictor:
    settings = Settings.from_env()
    schedule = PostgresSchedule(settings) if settings.catalog_backend == "postgres" else None
    return TramFinalPredictor(fallback=MockPredictor(schedule))

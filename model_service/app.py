"""Serve the saved tram LightGBM ensemble for dates after its original release.

The published November–December 2025 final ensemble remains in the backend CSV.
This service extrapolates only the saved streaming ML component. Its long-range
accuracy has not been validated against observations after October 2025.
"""

from datetime import date
from functools import lru_cache
import importlib.util
import json
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import lightgbm as lgb
import numpy as np
import pandas as pd

ROOT = Path("/model")
FIRST_DATE = date(2026, 1, 1)
LAST_DATE = date(2027, 12, 31)
VERSION = "tram-stream-extrapolation-2025-10"


class PredictionRequest(BaseModel):
    route_id: str
    dates: list[date] = Field(min_length=1, max_length=31)


def _extend_calendar(source) -> None:
    """Keep the original 2025 features and supply explicit future assumptions."""
    source.DAYS = pd.date_range("2025-01-01", LAST_DATE.isoformat())
    source.ND = len(source.DAYS)
    source.DI = {day: index for index, day in enumerate(source.DAYS)}
    fixed_holidays = [(1, day) for day in range(1, 9)] + [
        (2, 23), (3, 8), (5, 1), (5, 9), (6, 12), (11, 4),
    ]
    future_holidays = [pd.Timestamp(year=year, month=month, day=day)
                       for year in (2026, 2027) for month, day in fixed_holidays]
    source.HOL = source.HOL.append(pd.DatetimeIndex(future_holidays))
    source.PRE_HOL = source.PRE_HOL.append(pd.DatetimeIndex(
        [day - pd.Timedelta(days=1) for day in future_holidays]
    ))
    source.SCHOOL += [(f"{year}-01-01", f"{year}-01-08") for year in (2026, 2027)]
    source.SCHOOL += [(f"{year}-05-24", f"{year}-08-31") for year in (2026, 2027)]
    source.CAL = source.calendar()
    source.RESTR = np.zeros((source.R, source.ND), dtype=int)
    for route in source.RESTRICT_ROUTES:
        affected = (source.DAYS >= source.RESTRICT[0]) & (source.DAYS <= source.RESTRICT[1]) & source.CAL.off.values
        source.RESTR[source.ROUTES.index(route), affected] = 1
    source.KIND = source.CAL.kind.values
    source.DOW = source.CAL.dow.values


class ForecastEngine:
    def __init__(self) -> None:
        spec = importlib.util.spec_from_file_location("tram_source_features", ROOT / "tram_ml" / "v4.py")
        if spec is None or spec.loader is None:
            raise RuntimeError("Tram feature code is missing")
        source = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(source)
        _extend_calendar(source)
        self.source = source
        self.cutoff = source.DI[pd.Timestamp("2025-10-31")]
        self.history = source.load_labels()
        self.history[:, self.cutoff + 1:, :] = np.nan
        manifest = json.loads((ROOT / "artifacts" / "manifest.json").read_text(encoding="utf-8"))
        if manifest["cutoff"] != "2025-10-31" or manifest["mode"] != "anchor":
            raise RuntimeError("Unexpected tram model artifact")
        self.volume = [(config["features"], [lgb.Booster(model_file=str(ROOT / "artifacts" / name))
                                             for name in config["files"]])
                       for config in manifest["volume_models"]]
        self.shape_features = manifest["shape_model"]["features"]
        self.shape = lgb.Booster(model_file=str(ROOT / "artifacts" / manifest["shape_model"]["file"]))
        self.shape_blend = float(manifest["shape_blend"])
        self.routes = {str(route): index for index, route in enumerate(source.ROUTES)}

    @lru_cache(maxsize=400)
    def predict_day(self, day: date) -> tuple[tuple[int, ...], ...]:
        source = self.source
        index = source.DI[pd.Timestamp(day)]
        features = source.day_features(self.history, index, limit=self.cutoff + 1)
        outputs = []
        for names, models in self.volume:
            values = np.mean([model.predict(features[names], num_threads=1) for model in models], axis=0)
            values += features.B.to_numpy()
            outputs.append(values)
        hourly = np.clip(np.mean(outputs, axis=0) * features.scale.to_numpy(), 0, None)
        hourly[features.hour.isin([1, 2, 3, 4]).to_numpy()] = 0
        level = hourly.reshape(len(self.routes), 24)

        calendar = source.CAL.iloc[index]
        shape_rows = pd.DataFrame({
            "route": np.repeat(np.arange(len(self.routes)), 24),
            "hour": np.tile(np.arange(24), len(self.routes)),
            "dowx": 6 if calendar.hol else int(calendar.dow),
            "kind": int(calendar.kind),
            "hol": int(calendar.hol),
            "preh": int(calendar.preh),
            "daylight": float(calendar.daylight),
            "restr": source.RESTR[:, index].repeat(24),
        })
        shape = np.clip(self.shape.predict(shape_rows[self.shape_features], num_threads=1), 0, None)
        shape = shape.reshape(len(self.routes), 24)
        totals = level.sum(axis=1, keepdims=True)
        shape_share = np.divide(shape, shape.sum(axis=1, keepdims=True),
                                out=np.zeros_like(shape), where=shape.sum(axis=1, keepdims=True) > 0)
        own_share = np.divide(level, totals, out=np.zeros_like(level), where=totals > 0)
        result = totals * (self.shape_blend * shape_share + (1 - self.shape_blend) * own_share)
        result[:, 1:5] = 0
        rounded = np.rint(np.clip(result, 0, None)).astype(int)
        return tuple(tuple(int(value) for value in route) for route in rounded)


engine = ForecastEngine()
inference_lock = Lock()
app = FastAPI(title="Tram model service", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_version": VERSION}


@app.post("/predict")
def predict(request: PredictionRequest) -> dict:
    route = request.route_id.removeprefix("demo-")
    if route not in engine.routes:
        raise HTTPException(422, "Unsupported route")
    if any(day < FIRST_DATE or day > LAST_DATE for day in request.dates):
        raise HTTPException(422, "Forecast date is outside 2026–2027")
    index = engine.routes[route]
    with inference_lock:
        days = [{"date": day.isoformat(), "hourly": engine.predict_day(day)[index]}
                for day in request.dates]
    return {"model_version": VERSION, "route_id": request.route_id,
            "days": days}

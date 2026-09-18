"""Synthetic index for integration only; neither occupancy nor passenger counts."""

import json
from datetime import datetime, timedelta
from hashlib import sha256
from math import exp
from pathlib import Path

from app.schemas import (
    ForecastPoint, ForecastRequest, ForecastResponse, Horizon, SeriesKey, add_months,
)

SERVICE_HOURS = json.loads(
    (Path(__file__).resolve().parents[3] / "mock_data" / "service_hours.json").read_text(encoding="utf-8")
)


def in_demo_service(series_key: str, value: datetime) -> bool:
    """Approximate operating window; exact departures require licensed schedule data."""
    route_id, _, stop_id = series_key.partition("/")
    stop_id = stop_id.split("/", 1)[0]
    window = (SERVICE_HOURS["stops"].get(stop_id)
              or SERVICE_HOURS["routes"].get(route_id)
              or SERVICE_HOURS["default"])
    start = int(window["start"][:2]) * 60 + int(window["start"][3:])
    end = int(window["end"][:2]) * 60 + int(window["end"][3:])
    minute = value.hour * 60 + value.minute
    return start <= minute < end if start < end else minute >= start or minute < end


def hour_value(key: str, value: datetime) -> float:
    if not in_demo_service(key, value):
        return 0.0
    seed = int(sha256(key.encode()).hexdigest()[:8], 16)
    base = 18 + seed % 30
    clock_hour = value.hour + value.minute / 60
    rush = 45 * exp(-((clock_hour - 8) / 2) ** 2) + 38 * exp(-((clock_hour - 18) / 2.5) ** 2)
    weekend = 0.75 if value.weekday() >= 5 else 1.0
    return (base + rush) * weekend


class MockPredictor:
    def predict(self, request: ForecastRequest) -> ForecastResponse:
        points = []
        key = f"{request.route_id}/{request.stop_id}/{request.direction_id}"
        for timestamp in request.timestamps():
            end = (add_months(timestamp, 1) if request.horizon == Horizon.YEAR else
                   timestamp + (timedelta(days=1) if request.horizon == Horizon.MONTH else
                                timedelta(minutes=1) if request.resolution == "PT1M" else timedelta(hours=1)))
            hourly = []
            tick = timestamp
            while tick < end:
                hourly.append(hour_value(key, tick))
                tick += timedelta(hours=1)
            prediction = round(sum(hourly) / len(hourly), 2)
            points.append(ForecastPoint(
                timestamp=timestamp,
                predicted_load=prediction,
                lower_bound=round(prediction * 0.85, 2),
                upper_bound=round(prediction * 1.15, 2),
            ))
        return ForecastResponse(
            series_key=SeriesKey(route_id=request.route_id, stop_id=request.stop_id, direction_id=request.direction_id),
            horizon=request.horizon, resolution=request.resolution,
            forecast_origin=request.forecast_origin,
            value_unit="demo_index", aggregation="demo_mean", is_mock=True,
            model_version="mock-v0", interval_level=None, points=points,
        )


def build_predictor() -> MockPredictor:
    return MockPredictor()

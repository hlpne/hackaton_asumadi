"""Synthetic index for integration only; neither occupancy nor passenger counts."""

from datetime import datetime, timedelta
from hashlib import sha256
from math import exp

from app.schemas import (
    ForecastPoint, ForecastRequest, ForecastResponse, Horizon, RESOLUTIONS, SeriesKey, add_months,
)


def hour_value(key: str, value: datetime) -> float:
    seed = int(sha256(key.encode()).hexdigest()[:8], 16)
    base = 18 + seed % 30
    rush = 45 * exp(-((value.hour - 8) / 2) ** 2) + 38 * exp(-((value.hour - 18) / 2.5) ** 2)
    weekend = 0.75 if value.weekday() >= 5 else 1.0
    return (base + rush) * weekend


class MockPredictor:
    def predict(self, request: ForecastRequest) -> ForecastResponse:
        points = []
        key = f"{request.route_id}/{request.stop_id}/{request.direction_id}"
        for timestamp in request.timestamps():
            end = (add_months(timestamp, 1) if request.horizon == Horizon.YEAR else
                   timestamp + (timedelta(days=1) if request.horizon == Horizon.MONTH else timedelta(hours=1)))
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
            horizon=request.horizon, resolution=RESOLUTIONS[request.horizon],
            forecast_origin=request.forecast_origin,
            value_unit="demo_index", aggregation="demo_mean", is_mock=True,
            model_version="mock-v0", interval_level=None, points=points,
        )


def build_predictor() -> MockPredictor:
    return MockPredictor()

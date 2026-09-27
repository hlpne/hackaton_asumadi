"""Synthetic index for integration only; neither occupancy nor passenger counts."""

import json
from datetime import datetime, timedelta
from functools import lru_cache
from hashlib import sha256
from math import exp
from pathlib import Path

from app.schemas import (
    ForecastPoint, ForecastRequest, ForecastResponse, Horizon, SeriesKey, add_months,
)
from app.config import Settings
from app.schedule import PostgresSchedule

SERVICE_HOURS = json.loads(
    (Path(__file__).resolve().parents[3] / "mock_data" / "service_hours.json").read_text(encoding="utf-8")
)


@lru_cache(maxsize=4096)
def _service_minutes(series_key: str) -> tuple[int, int]:
    route_id, _, stop_id = series_key.partition("/")
    stop_id = stop_id.split("/", 1)[0]
    window = (SERVICE_HOURS["stops"].get(stop_id)
              or SERVICE_HOURS["routes"].get(route_id)
              or SERVICE_HOURS["default"])
    start = int(window["start"][:2]) * 60 + int(window["start"][3:])
    end = int(window["end"][:2]) * 60 + int(window["end"][3:])
    return start, end


def _in_demo_service_at_minute(series_key: str, minute: int) -> bool:
    start, end = _service_minutes(series_key)
    return start <= minute < end if start < end else minute >= start or minute < end


def in_demo_service(series_key: str, value: datetime) -> bool:
    """Approximate operating window; exact departures require licensed schedule data."""
    return _in_demo_service_at_minute(series_key, value.hour * 60 + value.minute)


@lru_cache(maxsize=4096)
def _base_index(key: str) -> int:
    return 18 + int(sha256(key.encode()).hexdigest()[:8], 16) % 30


# The synthetic hourly value depends on the stop, clock time and weekend flag,
# so repeated days in a monthly snapshot can share the same result.
@lru_cache(maxsize=32768)
def _hour_pattern(key: str, hour: int, minute: int, weekend: bool, enforce_service_window: bool) -> float:
    if enforce_service_window and not _in_demo_service_at_minute(key, hour * 60 + minute):
        return 0.0
    base = _base_index(key)
    clock_hour = hour + minute / 60
    rush = 45 * exp(-((clock_hour - 8) / 2) ** 2) + 38 * exp(-((clock_hour - 18) / 2.5) ** 2)
    return (base + rush) * (0.75 if weekend else 1.0)


def hour_value(key: str, value: datetime, enforce_service_window: bool = True) -> float:
    return _hour_pattern(key, value.hour, value.minute, value.weekday() >= 5, enforce_service_window)


@lru_cache(maxsize=8192)
def _daily_total(key: str, weekend: bool) -> float:
    return sum(_hour_pattern(key, hour, 0, weekend, True) for hour in range(24))


class MockPredictor:
    def __init__(self, schedule: PostgresSchedule | None = None) -> None:
        self.schedule = schedule

    def predict(self, request: ForecastRequest) -> ForecastResponse:
        points = []
        key = f"{request.route_id}/{request.stop_id}/{request.direction_id}"
        if request.resolution == "schedule":
            timestamps = self.schedule.arrivals(request) if self.schedule is not None else []
        else:
            timestamps = request.timestamps()
        for timestamp in timestamps:
            end = (add_months(timestamp, 1) if request.horizon == Horizon.YEAR else
                   timestamp + (timedelta(days=1) if request.horizon == Horizon.MONTH else
                                timedelta(minutes=1) if request.resolution in {"schedule", "PT1M"} else timedelta(hours=1)))
            if request.horizon == Horizon.YEAR:
                total = 0.0
                days = 0
                tick = timestamp
                while tick < end:
                    total += _daily_total(key, tick.weekday() >= 5)
                    days += 1
                    tick += timedelta(days=1)
                prediction = round(total / (days * 24), 2)
            else:
                hourly = []
                tick = timestamp
                while tick < end:
                    hourly.append(hour_value(key, tick, request.resolution != "schedule"))
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
            model_version="mock-schedule-v1" if request.resolution == "schedule" else "mock-v0",
            interval_level=None, points=points,
        )


def build_predictor() -> MockPredictor:
    settings = Settings.from_env()
    schedule = PostgresSchedule(settings) if settings.catalog_backend == "postgres" else None
    return MockPredictor(schedule)

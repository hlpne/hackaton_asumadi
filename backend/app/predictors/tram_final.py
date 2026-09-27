"""Serve the final 2025 route forecast and delegate later dates to the ML service.

The published final ensemble is preserved exactly in its release CSV. Later dates
use saved LightGBM boosters with the available historical route-hour labels.
"""

import csv
from datetime import date, datetime
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import ROOT, Settings
from app.predictors.mock import MockPredictor
from app.schedule import PostgresSchedule
from app.schemas import ForecastPoint, ForecastRequest, ForecastResponse, Horizon, MOSCOW, SeriesKey

DATA_PATH = ROOT / "tram_final" / "tram_final" / "outputs" / "submission_final.csv"
FIRST_DAY = date(2025, 11, 1)
LAST_DAY = date(2025, 12, 31)
MODEL_VERSION = "tram-final-2025-0.90461"
EXTENDED_MODEL_VERSION = "tram-stream-extrapolation-2025-10"
SUPPORTED_ROUTES = frozenset({"1", "7", "11", "12", "17", "25", "26", "28", "50"})


class TramFinalPredictor:
    def __init__(self, path: Path = DATA_PATH, fallback: MockPredictor | None = None,
                 model_service_url: str | None = None) -> None:
        self._fallback = fallback or MockPredictor()
        self._model_service_url = model_service_url
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

    def _future_days(self, route: str, dates: list[date]) -> dict[date, list[int]]:
        if not self._model_service_url:
            raise RuntimeError("The model service is not configured")
        payload = json.dumps({"route_id": route, "dates": [day.isoformat() for day in dates]}).encode()
        query = Request(self._model_service_url.rstrip("/") + "/predict", data=payload,
                        headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urlopen(query, timeout=90) as response:
                data = json.load(response)
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
            raise RuntimeError("The model service is unavailable") from exc
        if data.get("model_version") != EXTENDED_MODEL_VERSION or data.get("route_id") != route:
            raise RuntimeError("The model service returned a different model or route")
        rows = data.get("days")
        if not isinstance(rows, list) or len(rows) != len(dates):
            raise RuntimeError("The model service returned incomplete dates")
        result: dict[date, list[int]] = {}
        for row in rows:
            day = date.fromisoformat(row["date"])
            values = row["hourly"]
            if day not in dates or day in result or len(values) != 24 or any(
                type(value) is not int or value < 0 for value in values
            ):
                raise RuntimeError("The model service returned invalid hourly values")
            result[day] = values
        if set(result) != set(dates):
            raise RuntimeError("The model service returned different dates")
        return result

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
        if request.start.date() < FIRST_DAY or request.end > datetime(2028, 1, 1, tzinfo=MOSCOW):
            raise RuntimeError("The model covers 2025-11-01 through 2027-12-31")
        # forecast_origin is the API's selected query window anchor. It does not
        # retrain this fixed archive; its source cutoff is documented separately.
        if request.start.minute or request.start.second or request.end.minute or request.end.second:
            raise RuntimeError("The archived model has no sub-hour forecasts")
        if request.resolution == "P1D" and (request.start.hour or request.end.hour):
            raise RuntimeError("Daily forecasts must start and end at midnight")

        timestamps = request.timestamps()
        future_dates = sorted({timestamp.date() for timestamp in timestamps if timestamp.date() > LAST_DAY})
        future = self._future_days(route, future_dates) if future_dates else {}
        points = []
        for timestamp in timestamps:
            hourly = future.get(timestamp.date())
            if request.resolution == "PT1H":
                value = hourly[timestamp.hour] if hourly is not None else self._hourly[(route, timestamp.date(), timestamp.hour)]
            else:
                value = sum(hourly) if hourly is not None else sum(
                    self._hourly[(route, timestamp.date(), hour)] for hour in range(24))
            points.append(ForecastPoint(timestamp=timestamp, predicted_load=value))
        return ForecastResponse(
            series_key=SeriesKey(route_id=request.route_id, stop_id=None, direction_id=None),
            horizon=request.horizon, resolution=request.resolution,
            forecast_origin=request.forecast_origin, value_unit="validations",
            aggregation="sum", is_mock=False,
            model_version=EXTENDED_MODEL_VERSION if future_dates else MODEL_VERSION,
            points=points,
        )


def build_predictor() -> TramFinalPredictor:
    settings = Settings.from_env()
    schedule = PostgresSchedule(settings) if settings.catalog_backend == "postgres" else None
    return TramFinalPredictor(fallback=MockPredictor(schedule),
                              model_service_url=os.getenv("MODEL_SERVICE_URL"))

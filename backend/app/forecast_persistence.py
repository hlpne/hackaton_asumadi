"""Persistence boundary for validated, model-neutral forecast responses."""

from typing import Literal, Protocol

import psycopg
from pydantic import AwareDatetime, Field

from app.config import Settings
from app.schemas import ContractModel, ForecastResponse, Horizon, Resolution, SeriesKey


class ForecastPersistenceResult(ContractModel):
    contract_version: Literal["1.0"] = "1.0"
    series_key: SeriesKey
    horizon: Horizon
    resolution: Resolution
    forecast_origin: AwareDatetime
    model_version: str
    saved_points: int = Field(ge=0)


class ForecastPersistenceDisabledError(Exception):
    """Forecast writes require a configured PostgreSQL backend."""


class ModelRunConflictError(Exception):
    """A model version was reused with different public metadata."""


class ForecastRepository(Protocol):
    def save(self, response: ForecastResponse) -> ForecastPersistenceResult: ...


class DisabledForecastRepository:
    def save(self, response: ForecastResponse) -> ForecastPersistenceResult:
        raise ForecastPersistenceDisabledError


class PostgresForecastRepository:
    def __init__(self, settings: Settings) -> None:
        self.connection_parameters = settings.database_parameters()

    def save(self, response: ForecastResponse) -> ForecastPersistenceResult:
        key = response.series_key
        with psycopg.connect(**self.connection_parameters) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO model_runs(model_version, is_mock, value_unit, aggregation, interval_level) "
                    "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (model_version) DO NOTHING",
                    (
                        response.model_version,
                        response.is_mock,
                        response.value_unit,
                        response.aggregation,
                        response.interval_level,
                    ),
                )
                registered = cursor.execute(
                    "SELECT is_mock, value_unit, aggregation, interval_level "
                    "FROM model_runs WHERE model_version = %s FOR KEY SHARE",
                    (response.model_version,),
                ).fetchone()
                expected_metadata = (
                    response.is_mock,
                    response.value_unit,
                    response.aggregation,
                )
                registered_metadata = registered[:3] if registered is not None else None
                registered_interval = registered[3] if registered is not None else None
                interval_conflicts = (
                    registered_interval is not None
                    and response.interval_level is not None
                    and registered_interval != response.interval_level
                )
                if registered_metadata != expected_metadata or interval_conflicts:
                    raise ModelRunConflictError(response.model_version)
                if registered_interval is None and response.interval_level is not None:
                    cursor.execute(
                        "UPDATE model_runs SET interval_level = %s "
                        "WHERE model_version = %s AND interval_level IS NULL",
                        (response.interval_level, response.model_version),
                    )

                rows = [
                    (
                        response.contract_version,
                        key.route_id,
                        key.stop_id,
                        key.direction_id,
                        point.timestamp,
                        response.horizon,
                        response.resolution,
                        response.forecast_origin,
                        point.predicted_load,
                        point.lower_bound,
                        point.upper_bound,
                        response.value_unit,
                        response.aggregation,
                        response.is_mock,
                        response.model_version,
                        response.interval_level,
                    )
                    for point in response.points
                ]
                cursor.executemany(
                    "INSERT INTO forecasts("
                    "contract_version, route_id, stop_id, direction_id, timestamp, horizon, resolution, "
                    "forecast_origin, predicted_load, lower_bound, upper_bound, value_unit, aggregation, "
                    "is_mock, model_version, interval_level"
                    ") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (route_id, stop_id, direction_id, timestamp, horizon, forecast_origin, model_version) "
                    "DO UPDATE SET contract_version = EXCLUDED.contract_version, "
                    "resolution = EXCLUDED.resolution, predicted_load = EXCLUDED.predicted_load, "
                    "lower_bound = EXCLUDED.lower_bound, upper_bound = EXCLUDED.upper_bound, "
                    "value_unit = EXCLUDED.value_unit, aggregation = EXCLUDED.aggregation, "
                    "is_mock = EXCLUDED.is_mock, interval_level = EXCLUDED.interval_level",
                    rows,
                )

        return ForecastPersistenceResult(
            series_key=key,
            horizon=response.horizon,
            resolution=response.resolution,
            forecast_origin=response.forecast_origin,
            model_version=response.model_version,
            saved_points=len(response.points),
        )

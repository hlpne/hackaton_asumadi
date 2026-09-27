"""Public API and model boundary; no ML-library-specific objects here."""

from calendar import monthrange
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

MOSCOW = ZoneInfo("Europe/Moscow")
DirectionId = Annotated[int, Field(ge=0, le=1)]
Resolution = Literal["schedule", "PT1M", "PT1H", "P1D", "P1M"]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, allow_inf_nan=False)


class Horizon(StrEnum):
    DAY = "day"
    MONTH = "month"
    YEAR = "year"


RESOLUTIONS = {Horizon.DAY: "PT1H", Horizon.MONTH: "P1D", Horizon.YEAR: "P1M"}


def add_months(value: datetime, months: int) -> datetime:
    index = value.year * 12 + value.month - 1 + months
    year, month_index = divmod(index, 12)
    month = month_index + 1
    return value.replace(year=year, month=month, day=min(value.day, monthrange(year, month)[1]))


class ForecastRequest(ContractModel):
    route_id: str = Field(min_length=1, max_length=100)
    stop_id: str | None = Field(default=None, min_length=1, max_length=100)
    direction_id: DirectionId | None = None
    horizon: Horizon
    resolution: Resolution | None = None
    start: AwareDatetime = Field(alias="from")
    end: AwareDatetime = Field(alias="to")
    forecast_origin: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        self.resolution = self.resolution or RESOLUTIONS[self.horizon]
        allowed = {Horizon.DAY: {"schedule", "PT1M", "PT1H"}, Horizon.MONTH: {"P1D"}, Horizon.YEAR: {"P1M"}}
        if self.resolution not in allowed[self.horizon]:
            raise ValueError("resolution does not match horizon")
        self.start = self.start.astimezone(MOSCOW)
        self.end = self.end.astimezone(MOSCOW)
        self.forecast_origin = (self.forecast_origin or self.start).astimezone(MOSCOW)
        if self.start.year < 2000 or self.end.year > 2100:
            raise ValueError("Supported date range is 2000–2100")
        if self.end <= self.start:
            raise ValueError("to must be later than from; the range is [from, to)")
        if self.forecast_origin > self.start:
            raise ValueError("forecast_origin must be no later than from")
        for value in (self.start, self.end):
            if value.second or value.microsecond:
                raise ValueError("from and to must be on whole-minute boundaries in Europe/Moscow")
            if self.horizon != Horizon.DAY and value.minute:
                raise ValueError("month/year boundaries must be on whole-hour boundaries in Europe/Moscow")
            if self.horizon != Horizon.DAY and value.hour:
                raise ValueError("month/year boundaries must be at midnight in Europe/Moscow")
        limit = {
            Horizon.DAY: self.forecast_origin + timedelta(days=1),
            Horizon.MONTH: max(add_months(self.forecast_origin, 1), self.forecast_origin + timedelta(days=30)),
            Horizon.YEAR: max(add_months(self.forecast_origin, 12), self.forecast_origin + timedelta(days=365)),
        }[self.horizon]
        if self.end > limit:
            raise ValueError("to exceeds the selected horizon measured from forecast_origin")
        return self

    def timestamps(self) -> list[datetime]:
        if self.resolution == "schedule":
            return []
        result = []
        current = self.start
        month_index = 0
        while current < self.end:
            result.append(current)
            if self.horizon == Horizon.YEAR:
                month_index += 1
                current = add_months(self.start, month_index)
            else:
                current += (timedelta(minutes=1) if self.resolution == "PT1M" else
                            timedelta(hours=1) if self.horizon == Horizon.DAY else timedelta(days=1))
        return result


class SeriesKey(ContractModel):
    route_id: str
    stop_id: str | None
    direction_id: DirectionId | None = None


class ForecastPoint(ContractModel):
    timestamp: AwareDatetime
    predicted_load: float = Field(ge=0)
    lower_bound: float | None = Field(default=None, ge=0)
    upper_bound: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_bounds(self) -> Self:
        self.timestamp = self.timestamp.astimezone(MOSCOW)
        if (self.lower_bound is None) != (self.upper_bound is None):
            raise ValueError("Both bounds must be provided together, or both must be null")
        if self.lower_bound is not None and not self.lower_bound <= self.predicted_load <= self.upper_bound:
            raise ValueError("Expected lower_bound <= predicted_load <= upper_bound")
        return self


class ForecastResponse(ContractModel):
    contract_version: Literal["1.0"] = "1.0"
    series_key: SeriesKey
    horizon: Horizon
    resolution: Resolution
    forecast_origin: AwareDatetime
    value_unit: str = Field(min_length=1)
    aggregation: Literal["demo_mean", "sum", "mean", "max", "last"]
    is_mock: bool
    model_version: str = Field(min_length=1)
    interval_level: float | None = Field(default=None, gt=0, lt=1)
    points: list[ForecastPoint] = Field(max_length=1440)

    @model_validator(mode="after")
    def validate_metadata(self) -> Self:
        self.forecast_origin = self.forecast_origin.astimezone(MOSCOW)
        allowed = {Horizon.DAY: {"schedule", "PT1M", "PT1H"}, Horizon.MONTH: {"P1D"}, Horizon.YEAR: {"P1M"}}
        if self.resolution not in allowed[self.horizon]:
            raise ValueError("resolution does not match horizon in contract v1")
        if self.interval_level is not None and any(p.lower_bound is None for p in self.points):
            raise ValueError("interval_level requires bounds for every point")
        return self


class SnapshotRequest(ContractModel):
    horizon: Horizon = Horizon.DAY
    timestamp: AwareDatetime | None = None
    forecast_origin: AwareDatetime | None = None
    route_id: str | None = Field(default=None, min_length=1, max_length=100)
    direction_id: DirectionId | None = None

    @model_validator(mode="after")
    def validate_snapshot(self) -> Self:
        if self.timestamp is None:
            default = "2026-09-26T08:00:00+03:00" if self.horizon == Horizon.DAY else "2026-09-01T00:00:00+03:00"
            self.timestamp = datetime.fromisoformat(default)
        self.timestamp = self.timestamp.astimezone(MOSCOW)
        self.forecast_origin = (self.forecast_origin or self.timestamp).astimezone(MOSCOW)
        if self.timestamp.year < 2000 or self.timestamp.year > 2100:
            raise ValueError("Supported date range is 2000–2100")
        if self.forecast_origin > self.timestamp:
            raise ValueError("forecast_origin must be no later than timestamp")
        if self.timestamp.second or self.timestamp.microsecond:
            raise ValueError("timestamp must be on a whole-minute boundary in Europe/Moscow")
        if self.horizon != Horizon.DAY and self.timestamp.minute:
            raise ValueError("month/year timestamp must be on a whole-hour boundary in Europe/Moscow")
        if self.horizon != Horizon.DAY and self.timestamp.hour:
            raise ValueError("month/year timestamp must be at midnight in Europe/Moscow")
        return self

    def forecast_request(self, route_id: str, stop_id: str, direction_id: int) -> ForecastRequest:
        assert self.timestamp is not None
        end = {
            Horizon.DAY: self.timestamp + timedelta(hours=1),
            Horizon.MONTH: self.timestamp + timedelta(days=1),
            Horizon.YEAR: add_months(self.timestamp, 1),
        }[self.horizon]
        return ForecastRequest(
            route_id=route_id,
            stop_id=stop_id,
            direction_id=direction_id,
            horizon=self.horizon,
            **{"from": self.timestamp, "to": end},
            forecast_origin=self.forecast_origin,
        )


class TopOverloadRequest(SnapshotRequest):
    limit: int = Field(default=5, ge=1, le=50)


class MapForecastPoint(ContractModel):
    route_id: str
    route_name: str
    route_color: str
    stop_id: str
    stop_name: str
    direction_id: DirectionId
    sequence: int = Field(ge=0)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    predicted_load: float = Field(ge=0)
    lower_bound: float | None = Field(default=None, ge=0)
    upper_bound: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_bounds(self) -> Self:
        if (self.lower_bound is None) != (self.upper_bound is None):
            raise ValueError("Both bounds must be provided together, or both must be null")
        if self.lower_bound is not None and not self.lower_bound <= self.predicted_load <= self.upper_bound:
            raise ValueError("Expected lower_bound <= predicted_load <= upper_bound")
        return self


class MapForecastResponse(ContractModel):
    contract_version: Literal["1.0"] = "1.0"
    horizon: Horizon
    timestamp: AwareDatetime
    forecast_origin: AwareDatetime
    value_unit: str
    aggregation: Literal["demo_mean", "sum", "mean", "max", "last"]
    is_mock: bool
    model_version: str
    interval_level: float | None
    points: list[MapForecastPoint]


class OverloadItem(MapForecastPoint):
    rank: int = Field(ge=1)


class TopOverloadResponse(ContractModel):
    contract_version: Literal["1.0"] = "1.0"
    horizon: Horizon
    timestamp: AwareDatetime
    forecast_origin: AwareDatetime
    value_unit: str
    aggregation: Literal["demo_mean", "sum", "mean", "max", "last"]
    is_mock: bool
    model_version: str
    interval_level: float | None
    ranking_basis: Literal["predicted_load_desc"] = "predicted_load_desc"
    items: list[OverloadItem]


class Route(ContractModel):
    id: str
    name: str
    color: str


class Stop(ContractModel):
    id: str
    name: str
    lat: float
    lon: float


class RouteStop(Stop):
    sequence: int
    direction_id: DirectionId


class ErrorDetail(ContractModel):
    code: str
    message: str
    details: list[dict] = Field(default_factory=list)


class ErrorResponse(ContractModel):
    error: ErrorDetail


class LivenessResponse(ContractModel):
    status: Literal["ok"] = "ok"
    service: str
    version: str
    environment: str


class ReadinessResponse(LivenessResponse):
    catalog_backend: Literal["memory", "postgres"]
    database: Literal["disabled", "ok"]


class ModelCoverage(ContractModel):
    history_from: str
    history_to: str
    forecast_from: str
    forecast_to: str
    routes: int = Field(ge=1)
    horizon_days: int = Field(ge=1)


class ModelMetricSet(ContractModel):
    name: str
    wape: float | None = Field(default=None, ge=0)
    mae: float | None = Field(default=None, ge=0)
    bias: float | None = None


class ModelMetricSlice(ContractModel):
    label: str
    wape: float = Field(ge=0)


class ModelValidation(ContractModel):
    method: str
    leakage_control: str
    baseline: ModelMetricSet
    final: ModelMetricSet
    folds: list[ModelMetricSlice]
    horizon_buckets: list[ModelMetricSlice]


class ModelDataSource(ContractModel):
    name: str
    description: str
    url: str | None = None


class ModelMetadataResponse(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    status: Literal["validated", "validation_pending"]
    model_version: str
    built_at: str | None = None
    target: str
    value_unit: str
    coverage: ModelCoverage
    validation: ModelValidation
    feature_families: list[str]
    limitations: list[str]
    sources: list[ModelDataSource]

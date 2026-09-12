"""Public API and model boundary; no ML-library-specific objects here."""

from calendar import monthrange
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

MOSCOW = ZoneInfo("Europe/Moscow")
DirectionId = Annotated[int, Field(ge=0, le=1)]


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
    start: AwareDatetime = Field(alias="from")
    end: AwareDatetime = Field(alias="to")
    forecast_origin: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_range(self) -> Self:
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
            if value.minute or value.second or value.microsecond:
                raise ValueError("from and to must be on whole-hour boundaries in Europe/Moscow")
            if self.horizon != Horizon.DAY and value.hour:
                raise ValueError("month/year boundaries must be at midnight in Europe/Moscow")
            if self.horizon == Horizon.YEAR and value.day != 1:
                raise ValueError("year boundaries must be the first day of a month")
        limit = {
            Horizon.DAY: self.forecast_origin + timedelta(days=1),
            Horizon.MONTH: add_months(self.forecast_origin, 1),
            Horizon.YEAR: add_months(self.forecast_origin, 12),
        }[self.horizon]
        if self.end > limit:
            raise ValueError("to exceeds the selected horizon measured from forecast_origin")
        return self

    def timestamps(self) -> list[datetime]:
        result = []
        current = self.start
        while current < self.end:
            result.append(current)
            if self.horizon == Horizon.YEAR:
                current = add_months(current, 1)
            else:
                current += timedelta(hours=1) if self.horizon == Horizon.DAY else timedelta(days=1)
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
    resolution: Literal["PT1H", "P1D", "P1M"]
    forecast_origin: AwareDatetime
    value_unit: str = Field(min_length=1)
    aggregation: Literal["demo_mean", "sum", "mean", "max", "last"]
    is_mock: bool
    model_version: str = Field(min_length=1)
    interval_level: float | None = Field(default=None, gt=0, lt=1)
    points: list[ForecastPoint] = Field(min_length=1, max_length=744)

    @model_validator(mode="after")
    def validate_metadata(self) -> Self:
        self.forecast_origin = self.forecast_origin.astimezone(MOSCOW)
        if self.resolution != RESOLUTIONS[self.horizon]:
            raise ValueError("resolution does not match horizon in contract v1")
        if self.interval_level is not None and any(p.lower_bound is None for p in self.points):
            raise ValueError("interval_level requires bounds for every point")
        return self


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

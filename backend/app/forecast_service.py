"""Application service for model-neutral forecast HTTP views."""

import logging

from pydantic import ValidationError

from app.catalog import Catalog
from app.predictors.base import Predictor, validate_prediction
from app.schemas import (
    ForecastRequest,
    ForecastResponse,
    Horizon,
    MapForecastPoint,
    MapForecastResponse,
    OverloadItem,
    SnapshotRequest,
    TopOverloadResponse,
)

logger = logging.getLogger(__name__)


class InvalidPredictionError(Exception):
    """The configured provider returned data outside the public contract."""


class PredictorUnavailableError(Exception):
    """The configured provider could not produce a prediction."""


def predict(provider: Predictor, request: ForecastRequest) -> ForecastResponse:
    try:
        return validate_prediction(request, provider.predict(request))
    except (ValidationError, ValueError, TypeError, AttributeError) as exc:
        logger.error("Predictor violated the forecast contract: %s", type(exc).__name__)
        raise InvalidPredictionError from exc
    except Exception as exc:
        logger.error("Predictor failed: %s", type(exc).__name__)
        raise PredictorUnavailableError from exc


def snapshot(catalog: Catalog, provider: Predictor, query: SnapshotRequest) -> MapForecastResponse:
    routes = catalog.routes()
    if query.route_id is not None:
        routes = [route for route in routes if route.id == query.route_id]
        if not routes:
            raise LookupError("Route not found")

    points: list[MapForecastPoint] = []
    metadata: ForecastResponse | None = None
    for route in routes:
        route_stops = catalog.stops(route.id)
        if query.direction_id is not None:
            route_stops = [stop for stop in route_stops if stop.direction_id == query.direction_id]
            if query.route_id is not None and not route_stops:
                raise LookupError("Direction not found on this route")
        for stop in route_stops:
            response = predict(provider, query.forecast_request(route.id, stop.id, stop.direction_id))
            point = response.points[0]
            if metadata is None:
                metadata = response
            elif (
                response.value_unit,
                response.aggregation,
                response.is_mock,
                response.model_version,
                response.interval_level,
            ) != (
                metadata.value_unit,
                metadata.aggregation,
                metadata.is_mock,
                metadata.model_version,
                metadata.interval_level,
            ):
                raise InvalidPredictionError("Provider returned inconsistent snapshot metadata")
            points.append(
                MapForecastPoint(
                    route_id=route.id,
                    route_name=route.name,
                    route_color=route.color,
                    stop_id=stop.id,
                    stop_name=stop.name,
                    direction_id=stop.direction_id,
                    sequence=stop.sequence,
                    lat=stop.lat,
                    lon=stop.lon,
                    predicted_load=point.predicted_load,
                    lower_bound=point.lower_bound,
                    upper_bound=point.upper_bound,
                )
            )

    if metadata is None or query.timestamp is None or query.forecast_origin is None:
        raise InvalidPredictionError("Snapshot contains no forecast series")
    return MapForecastResponse(
        horizon=query.horizon,
        timestamp=query.timestamp,
        forecast_origin=query.forecast_origin,
        value_unit=metadata.value_unit,
        aggregation=metadata.aggregation,
        is_mock=metadata.is_mock,
        model_version=metadata.model_version,
        interval_level=metadata.interval_level,
        points=points,
    )


def top_overload(map_response: MapForecastResponse, limit: int) -> TopOverloadResponse:
    candidates = map_response.points
    if map_response.is_mock and map_response.horizon == Horizon.DAY:
        candidates = [point for point in candidates if point.predicted_load > 0]
    ranked = sorted(
        candidates,
        key=lambda point: (-point.predicted_load, point.route_id, point.direction_id, point.sequence),
    )[:limit]
    return TopOverloadResponse(
        horizon=map_response.horizon,
        timestamp=map_response.timestamp,
        forecast_origin=map_response.forecast_origin,
        value_unit=map_response.value_unit,
        aggregation=map_response.aggregation,
        is_mock=map_response.is_mock,
        model_version=map_response.model_version,
        interval_level=map_response.interval_level,
        items=[OverloadItem(rank=index, **point.model_dump()) for index, point in enumerate(ranked, start=1)],
    )

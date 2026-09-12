from importlib import import_module
from typing import Protocol

from app.schemas import ForecastRequest, ForecastResponse


class Predictor(Protocol):
    """A provider returns public domain objects, never DataFrames or NumPy arrays."""

    def predict(self, request: ForecastRequest) -> ForecastResponse: ...


def load_predictor(factory_path: str) -> Predictor:
    module_name, separator, function_name = factory_path.partition(":")
    if not separator or not module_name or not function_name:
        raise ValueError("PREDICTOR_FACTORY must be module:function")
    factory = getattr(import_module(module_name), function_name)
    provider = factory()
    if not callable(getattr(provider, "predict", None)):
        raise TypeError("Predictor factory must return an object with predict(request)")
    return provider


def validate_prediction(request: ForecastRequest, response: ForecastResponse) -> ForecastResponse:
    # Revalidate even model instances: providers must not bypass public invariants.
    result = ForecastResponse.model_validate(response.model_dump())
    key = result.series_key
    if (key.route_id, key.stop_id, key.direction_id) != (request.route_id, request.stop_id, request.direction_id):
        raise ValueError("Provider returned a different series")
    if result.horizon != request.horizon or result.forecast_origin != request.forecast_origin:
        raise ValueError("Provider returned a different horizon or origin")
    if [point.timestamp for point in result.points] != request.timestamps():
        raise ValueError("Provider returned an incomplete, unordered or different time grid")
    return result

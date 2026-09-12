"""Second synthetic provider to verify replacement without frontend changes."""

from app.schemas import ForecastPoint, ForecastRequest, ForecastResponse, RESOLUTIONS, SeriesKey


class ConstantPredictor:
    def predict(self, request: ForecastRequest) -> ForecastResponse:
        return ForecastResponse(
            series_key=SeriesKey(route_id=request.route_id, stop_id=request.stop_id, direction_id=request.direction_id),
            horizon=request.horizon, resolution=RESOLUTIONS[request.horizon],
            forecast_origin=request.forecast_origin,
            value_unit="demo_index", aggregation="demo_mean", is_mock=True,
            model_version="constant-demo-v0",
            points=[ForecastPoint(timestamp=timestamp, predicted_load=42.0) for timestamp in request.timestamps()],
        )


def build_predictor() -> ConstantPredictor:
    return ConstantPredictor()

from fastapi.testclient import TestClient

from app.catalog import MemoryCatalog
from app.config import Settings
from app.forecast_persistence import ForecastPersistenceResult
from app.main import create_app
from app.schemas import ForecastResponse


PAYLOAD = {
    "route_id": "demo-17",
    "stop_id": "demo-17-s01",
    "direction_id": 0,
    "horizon": "day",
    "from": "2026-09-26T08:00:00+03:00",
    "to": "2026-09-26T10:00:00+03:00",
}


class RecordingRepository:
    def __init__(self) -> None:
        self.responses: list[ForecastResponse] = []

    def save(self, response: ForecastResponse) -> ForecastPersistenceResult:
        self.responses.append(response)
        return ForecastPersistenceResult(
            series_key=response.series_key,
            horizon=response.horizon,
            resolution=response.resolution,
            forecast_origin=response.forecast_origin,
            model_version=response.model_version,
            saved_points=len(response.points),
        )


def test_post_forecast_validates_predicts_and_persists_series():
    repository = RecordingRepository()
    app = create_app(Settings(), catalog=MemoryCatalog(), forecast_repository=repository)
    with TestClient(app) as client:
        response = client.post("/forecast", json=PAYLOAD)

    assert response.status_code == 200
    assert response.json()["saved_points"] == 2
    assert response.json()["model_version"] == "mock-v0"
    assert len(repository.responses) == 1
    assert repository.responses[0].series_key.model_dump() == {
        "route_id": "demo-17",
        "stop_id": "demo-17-s01",
        "direction_id": 0,
    }


def test_post_forecast_is_explicitly_disabled_without_postgres():
    with TestClient(create_app(Settings())) as client:
        response = client.post("/forecast", json=PAYLOAD)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PERSISTENCE_DISABLED"


def test_post_forecast_rejects_mismatched_route_stop_before_write():
    repository = RecordingRepository()
    app = create_app(Settings(), catalog=MemoryCatalog(), forecast_repository=repository)
    payload = {**PAYLOAD, "route_id": "demo-39"}
    with TestClient(app) as client:
        response = client.post("/forecast", json=payload)

    assert response.status_code == 404
    assert repository.responses == []


def test_post_forecast_resolves_unambiguous_stop_direction_before_write():
    repository = RecordingRepository()
    app = create_app(Settings(), catalog=MemoryCatalog(), forecast_repository=repository)
    payload = {key: value for key, value in PAYLOAD.items() if key != "direction_id"}
    with TestClient(app) as client:
        response = client.post("/forecast", json=payload)

    assert response.status_code == 200
    assert response.json()["series_key"]["direction_id"] == 0
    assert repository.responses[0].series_key.direction_id == 0


def test_openapi_exposes_get_and_post_on_forecast_path():
    schema = create_app(Settings()).openapi()
    assert {"get", "post"} <= schema["paths"]["/forecast"].keys()

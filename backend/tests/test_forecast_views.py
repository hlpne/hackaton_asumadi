from fastapi.testclient import TestClient
import pytest

from app.config import Settings
from app.main import create_app
from app.predictors.constant import ConstantPredictor
from app.schemas import MapForecastResponse, TopOverloadResponse


@pytest.fixture
def client():
    with TestClient(create_app(Settings())) as instance:
        yield instance


@pytest.mark.parametrize(
    ("horizon", "timestamp"),
    [
        ("day", "2026-09-26T08:00:00+03:00"),
        ("month", "2026-09-15T00:00:00+03:00"),
        ("year", "2026-09-01T00:00:00+03:00"),
    ],
)
def test_map_snapshot_supports_every_horizon(client, horizon, timestamp):
    response = client.get("/forecast/map", params={"horizon": horizon, "timestamp": timestamp})

    assert response.status_code == 200, response.text
    data = MapForecastResponse.model_validate(response.json())
    assert data.horizon == horizon
    assert data.timestamp.isoformat() == timestamp
    assert len(data.points) == 48
    assert data.is_mock is True
    assert data.value_unit == "demo_index"
    assert all(point.stop_name and point.route_name for point in data.points)


def test_map_filters_route_and_direction(client):
    response = client.get(
        "/forecast/map",
        params={"route_id": "demo-17", "direction_id": 1},
    )

    assert response.status_code == 200
    data = MapForecastResponse.model_validate(response.json())
    assert len(data.points) == 8
    assert {point.route_id for point in data.points} == {"demo-17"}
    assert {point.direction_id for point in data.points} == {1}


def test_map_rejects_unknown_route(client):
    response = client.get("/forecast/map", params={"route_id": "missing"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize(
    "params",
    [
        {"horizon": "week"},
        {"horizon": "day", "timestamp": "2026-09-26T08:15:00+03:00"},
        {"horizon": "month", "timestamp": "2026-09-26T08:00:00+03:00"},
        {"horizon": "year", "timestamp": "2026-09-26T00:00:00+03:00"},
        {"direction_id": 2},
        {"unknown": "field"},
    ],
)
def test_map_validation_uses_common_error_contract(client, params):
    response = client.get("/forecast/map", params=params)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_top_overload_is_deterministic_sorted_and_limited(client):
    params = {"horizon": "day", "timestamp": "2026-09-26T08:00:00+03:00", "limit": 7}
    first = client.get("/forecast/top-overload", params=params)
    second = client.get("/forecast/top-overload", params=params)

    assert first.status_code == 200, first.text
    assert first.json() == second.json()
    data = TopOverloadResponse.model_validate(first.json())
    assert [item.rank for item in data.items] == list(range(1, 8))
    assert [item.predicted_load for item in data.items] == sorted(
        (item.predicted_load for item in data.items), reverse=True
    )
    assert data.ranking_basis == "predicted_load_desc"


@pytest.mark.parametrize("limit", [0, 51])
def test_top_overload_validates_limit(client, limit):
    response = client.get("/forecast/top-overload", params={"limit": limit})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_snapshot_views_keep_the_same_contract_with_another_provider():
    with TestClient(create_app(Settings(), predictor=ConstantPredictor())) as client:
        map_response = client.get("/forecast/map", params={"route_id": "demo-17"})
        top_response = client.get("/forecast/top-overload", params={"route_id": "demo-17", "limit": 3})

    assert map_response.status_code == 200
    assert {point["predicted_load"] for point in map_response.json()["points"]} == {42.0}
    assert top_response.status_code == 200
    assert len(top_response.json()["items"]) == 3
    assert {item["predicted_load"] for item in top_response.json()["items"]} == {42.0}

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.predictors.tram_final import TramFinalPredictor


def client():
    return TestClient(create_app(Settings(), predictor=TramFinalPredictor()))


def query(**overrides):
    return {
        "route_id": "demo-1", "horizon": "day", "resolution": "PT1H",
        "from": "2025-11-01T00:00:00+03:00", "to": "2025-11-02T00:00:00+03:00",
        "forecast_origin": "2025-11-01T00:00:00+03:00",
    } | overrides


def test_archived_hourly_values_are_route_validations():
    with client() as api:
        response = api.get("/forecast", params=query())
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["value_unit"] == "validations"
    assert data["aggregation"] == "sum"
    assert data["is_mock"] is False
    assert data["series_key"] == {"route_id": "demo-1", "stop_id": None, "direction_id": None}
    assert [point["predicted_load"] for point in data["points"][:8]] == [3, 0, 0, 0, 4, 95, 365, 1061]
    assert all(point["lower_bound"] is None for point in data["points"])


def test_daily_value_sums_all_24_hours():
    with client() as api:
        hourly = api.get("/forecast", params=query()).json()
        daily = api.get("/forecast", params=query(horizon="month", resolution="P1D")).json()
    assert daily["points"][0]["predicted_load"] == sum(point["predicted_load"] for point in hourly["points"])
    assert daily["points"][0]["timestamp"] == hourly["points"][0]["timestamp"]


def test_stop_map_stays_labelled_as_demonstration():
    with client() as api:
        response = api.get("/forecast/map", params={
            "route_id": "demo-1", "horizon": "day", "timestamp": "2025-11-01T12:00:00+03:00",
        })
    assert response.status_code == 200, response.text
    assert response.json()["is_mock"] is True
    assert response.json()["value_unit"] == "demo_index"


def test_outside_archive_and_route_five_are_unavailable():
    with client() as api:
        outside = api.get("/forecast", params=query(**{
            "from": "2026-01-01T00:00:00+03:00", "to": "2026-01-02T00:00:00+03:00",
            "forecast_origin": "2026-01-01T00:00:00+03:00",
        }))
        route_five = api.get("/forecast", params=query(route_id="demo-5"))
    assert outside.status_code == 503
    assert route_five.status_code == 503

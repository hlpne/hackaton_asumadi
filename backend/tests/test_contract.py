import json
from datetime import timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
import psycopg
import pytest

from app.catalog import MemoryCatalog
from app.config import Settings
from app.main import create_app
from app.predictors.constant import ConstantPredictor
from app.predictors.mock import MockPredictor, hour_value
from app.schemas import ForecastRequest, ForecastResponse, MapForecastResponse, TopOverloadResponse, add_months

ROOT = Path(__file__).resolve().parents[2]
DAY = {"route_id": "demo-17", "horizon": "day", "from": "2026-09-26T00:00:00+03:00", "to": "2026-09-27T00:00:00+03:00"}


@pytest.fixture
def client():
    with TestClient(create_app(Settings())) as instance:
        yield instance


def test_catalog_and_health(client):
    assert client.get("/health").json()["database"] == "disabled"
    assert len(client.get("/routes").json()) == 36
    stops = client.get("/routes/demo-17/stops").json()
    assert len(stops) == 52
    assert [(item["direction_id"], item["sequence"]) for item in stops] == [(d, s) for d in (0, 1) for s in range(26)]
    assert stops[0]["name"] == "Усадьба Останкино"


def test_osm_route_geometry(client):
    response = client.get("/routes/demo-17/geometry")
    assert response.status_code == 200
    data = response.json()
    assert data["osm_relation_id"] == 540033
    assert data["source"] == "OpenStreetMap contributors"
    assert len(data["lines"]) > 40
    assert all(len(line) >= 2 for line in data["lines"])
    assert client.get("/routes/demo-17/geometry", params={"direction_id": 1}).json()["osm_relation_id"] == 540139


def test_all_scheme_routes_have_two_directions_and_geometry(client):
    routes = client.get("/routes").json()
    assert len(routes) == 36
    for route in routes:
        route_id = route["id"]
        stops = client.get(f"/routes/{route_id}/stops").json()
        for direction in (0, 1):
            direction_stops = [stop for stop in stops if stop["direction_id"] == direction]
            assert len(direction_stops) >= 8, route_id
            assert [stop["sequence"] for stop in direction_stops] == list(range(len(direction_stops)))
            geometry = client.get(f"/routes/{route_id}/geometry", params={"direction_id": direction})
            assert geometry.status_code == 200, route_id
            assert geometry.json()["lines"], route_id


@pytest.mark.parametrize("horizon,start,end,count", [
    ("day", "2026-09-26", "2026-09-27", 24),
    ("month", "2026-09-01", "2026-10-01", 30),
    ("month", "2028-02-01", "2028-03-01", 29),
    ("month", "2026-01-31", "2026-03-02", 30),
    ("year", "2026-09-01", "2027-09-01", 12),
    ("year", "2026-09-26", "2027-09-26", 12),
    ("year", "2026-01-31", "2027-01-31", 12),
])
def test_horizons_and_calendar(client, horizon, start, end, count):
    query = DAY | {"horizon": horizon, "from": start + "T00:00:00+03:00", "to": end + "T00:00:00+03:00"}
    response = client.get("/forecast", params=query)
    assert response.status_code == 200, response.text
    model = ForecastResponse.model_validate(response.json())
    assert len(model.points) == count
    timestamps = [point.timestamp for point in model.points]
    assert timestamps == sorted(set(timestamps))
    assert timestamps[-1] < ForecastRequest.model_validate(query).end
    assert client.get("/forecast", params=query).json() == response.json()


def test_mock_year_monthly_value_matches_hourly_reference():
    request = ForecastRequest.model_validate(DAY | {
        "horizon": "year",
        "resolution": "P1M",
        "from": "2026-09-27T00:00:00+03:00",
        "to": "2026-10-27T00:00:00+03:00",
        "stop_id": "demo-17-s01",
        "direction_id": 0,
    })
    point = MockPredictor().predict(request).points[0]
    key = f"{request.route_id}/{request.stop_id}/{request.direction_id}"
    end = add_months(point.timestamp, 1)
    hourly = []
    tick = point.timestamp
    while tick < end:
        hourly.append(hour_value(key, tick))
        tick += timedelta(hours=1)
    assert point.predicted_load == round(sum(hourly) / len(hourly), 2)


def test_day_range_accepts_hours_and_minutes(client):
    response = client.get("/forecast", params=DAY | {
        "from": "2026-09-26T07:25:00+03:00",
        "to": "2026-09-26T11:43:00+03:00",
    })
    assert response.status_code == 200, response.text
    points = response.json()["points"]
    assert [point["timestamp"] for point in points] == [
        f"2026-09-26T{hour:02d}:25:00+03:00" for hour in range(7, 12)
    ]


def test_day_can_return_one_point_per_minute(client):
    response = client.get("/forecast", params=DAY | {
        "resolution": "PT1M",
        "from": "2026-09-26T07:25:00+03:00",
        "to": "2026-09-26T07:30:00+03:00",
    })
    assert response.status_code == 200, response.text
    assert response.json()["resolution"] == "PT1M"
    assert [point["timestamp"] for point in response.json()["points"]] == [
        f"2026-09-26T07:{minute:02d}:00+03:00" for minute in range(25, 30)
    ]


def test_schedule_resolution_uses_arrival_instants_and_allows_an_empty_range():
    class ScheduleStub:
        def arrivals(self, request):
            if request.start.hour == 7:
                return [
                    request.start.replace(minute=27),
                    request.start.replace(minute=34),
                    request.start.replace(minute=46),
                ]
            return []

    with TestClient(create_app(Settings(), predictor=MockPredictor(ScheduleStub()))) as client:
        response = client.get("/forecast", params=DAY | {
            "resolution": "schedule",
            "from": "2026-09-26T07:25:00+03:00",
            "to": "2026-09-26T08:00:00+03:00",
        })
        empty = client.get("/forecast", params=DAY | {
            "resolution": "schedule",
            "from": "2026-09-26T02:00:00+03:00",
            "to": "2026-09-26T03:00:00+03:00",
        })

    assert response.status_code == 200, response.text
    assert response.json()["resolution"] == "schedule"
    assert [point["timestamp"][11:16] for point in response.json()["points"]] == ["07:27", "07:34", "07:46"]
    assert empty.status_code == 200
    assert empty.json()["points"] == []


def test_minute_resolution_only_applies_to_day(client):
    response = client.get("/forecast", params=DAY | {
        "horizon": "month", "resolution": "PT1M",
        "from": "2026-09-01T00:00:00+03:00", "to": "2026-10-01T00:00:00+03:00",
    })
    assert response.status_code == 422


def test_mock_service_window_has_no_night_load(client):
    response = client.get("/forecast", params=DAY)
    assert response.status_code == 200, response.text
    loads = {point["timestamp"][11:16]: point["predicted_load"] for point in response.json()["points"]}
    assert loads["00:00"] > 0  # Last evening trips may run after midnight.
    assert all(loads[f"{hour:02d}:00"] == 0 for hour in range(1, 5))
    assert loads["05:00"] > 0
    night = client.get("/forecast", params=DAY | {
        "from": "2026-09-26T02:10:00+03:00",
        "to": "2026-09-26T04:50:00+03:00",
    })
    assert night.status_code == 200, night.text
    assert all(point["predicted_load"] == point["lower_bound"] == point["upper_bound"] == 0
               for point in night.json()["points"])


@pytest.mark.parametrize("change", [
    {"to": "2026-09-26T00:00:00+03:00"},
    {"to": "2026-09-28T00:00:00+03:00"},
    {"from": "2026-09-26T00:00:00"},
    {"from": "2026-09-26T00:15:30+03:00"},
    {"horizon": "week"},
    {"stop_id": ""},
    {"direction_id": 2},
    {"unexpected": "field"},
    {"forecast_origin": "2026-09-25T00:00:00+03:00"},
    {"forecast_origin": "2026-09-26T01:00:00+03:00"},
])
def test_invalid_request_is_predictable_json(client, change):
    response = client.get("/forecast", params=DAY | change)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_timezone_and_direction(client):
    response = client.get("/forecast", params=DAY | {"from": "2026-09-25T21:00:00Z", "to": "2026-09-26T21:00:00Z", "direction_id": 0})
    assert response.status_code == 200, response.text
    assert response.json()["series_key"]["direction_id"] == 0
    assert response.json()["points"][0]["timestamp"] == "2026-09-26T00:00:00+03:00"


@pytest.mark.parametrize("change", [{"route_id": "missing"}, {"stop_id": "missing"}, {"stop_id": "demo-7-s01"}])
def test_unknown_or_unrelated_entity(client, change):
    response = client.get("/forecast", params=DAY | change)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_factory_replacement_preserves_http_contract():
    with TestClient(create_app(Settings(predictor_factory="app.predictors.constant:build_predictor"))) as client:
        response = client.get("/forecast", params=DAY)
    assert response.status_code == 200
    data = ForecastResponse.model_validate(response.json())
    assert data.model_version == "constant-demo-v0"
    assert all(p.predicted_load == 42 and p.lower_bound is None and p.upper_bound is None for p in data.points)


def test_non_mock_provider_uses_same_endpoint():
    class ModelStub(ConstantPredictor):
        def predict(self, request):
            return super().predict(request).model_copy(update={"is_mock": False, "value_unit": "test_unit", "aggregation": "mean", "model_version": "model-test"})
    with TestClient(create_app(Settings(), predictor=ModelStub())) as client:
        response = client.get("/forecast", params=DAY)
    assert response.status_code == 200
    assert response.json()["is_mock"] is False
    assert response.json()["value_unit"] == "test_unit"


def test_provider_utc_timestamps_are_normalized_for_frontend():
    class UtcProvider(ConstantPredictor):
        def predict(self, request):
            result = super().predict(request)
            result.forecast_origin = result.forecast_origin.astimezone(timezone.utc)
            for point in result.points:
                point.timestamp = point.timestamp.astimezone(timezone.utc)
            return result
    with TestClient(create_app(Settings(), predictor=UtcProvider())) as client:
        response = client.get("/forecast", params=DAY)
    assert response.status_code == 200
    assert response.json()["forecast_origin"].endswith("+03:00")
    assert all(point["timestamp"].endswith("+03:00") for point in response.json()["points"])


@pytest.mark.parametrize("defect", ["grid", "series", "bounds", "nonfinite"])
def test_invalid_provider_output_does_not_escape(defect):
    class Broken(ConstantPredictor):
        def predict(self, request):
            result = super().predict(request)
            if defect == "grid": result.points.reverse()
            if defect == "series": result.series_key.route_id = "other"
            if defect == "bounds": result.points[0].upper_bound = 12
            if defect == "nonfinite": result.points[0].predicted_load = float("nan")
            return result
    with TestClient(create_app(Settings(), predictor=Broken())) as client:
        response = client.get("/forecast", params=DAY)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "INVALID_PREDICTION"


def test_provider_failure_is_not_silently_replaced_by_mock():
    class Unavailable(ConstantPredictor):
        def predict(self, request):
            raise RuntimeError("private-model-detail")
    with TestClient(create_app(Settings(), predictor=Unavailable())) as client:
        response = client.get("/forecast", params=DAY)
    assert response.status_code == 503
    assert "private-model-detail" not in response.text
    assert response.json()["error"]["code"] == "PREDICTOR_UNAVAILABLE"


def test_database_failure_health():
    class BrokenCatalog(MemoryCatalog):
        def ping(self):
            raise psycopg.OperationalError("private-db-detail")
    with TestClient(create_app(Settings(catalog_backend="postgres"), catalog=BrokenCatalog())) as client:
        response = client.get("/health")
    assert response.status_code == 503
    assert "private-db-detail" not in response.text


def test_examples_and_schema_match_implementation(client):
    query = json.loads((ROOT / "docs/examples/forecast-request.json").read_text())
    expected = json.loads((ROOT / "docs/examples/forecast-response.json").read_text())
    assert client.get("/forecast", params=query).json() == expected
    assert json.loads((ROOT / "docs/contracts/forecast-request.schema.json").read_text()) == ForecastRequest.model_json_schema(by_alias=True)
    assert json.loads((ROOT / "docs/contracts/forecast-response.schema.json").read_text()) == ForecastResponse.model_json_schema()
    assert json.loads((ROOT / "docs/contracts/forecast-map-response.schema.json").read_text()) == MapForecastResponse.model_json_schema()
    assert json.loads((ROOT / "docs/contracts/forecast-top-overload-response.schema.json").read_text()) == TopOverloadResponse.model_json_schema()
    MapForecastResponse.model_validate_json((ROOT / "docs/examples/forecast-map-response.json").read_text())
    TopOverloadResponse.model_validate_json((ROOT / "docs/examples/forecast-top-overload-response.json").read_text())
    assert client.get("/openapi.json").json() == json.loads((ROOT / "docs/openapi.json").read_text())
    assert "./openapi.json" in client.get("/docs").text

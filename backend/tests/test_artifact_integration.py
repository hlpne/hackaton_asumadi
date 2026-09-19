"""Optional real CatBoost file tests; install requirements-model-example.txt."""

from fastapi.testclient import TestClient
import pytest

from app.config import Settings
from app.main import create_app
from app.schemas import ForecastRequest, ForecastResponse


@pytest.fixture(scope="module")
def artifacts(tmp_path_factory):
    pytest.importorskip("catboost", reason="Install requirements-model-example.txt for real artifact tests")
    from scripts.build_example_model import build_example

    directory = tmp_path_factory.mktemp("artifacts")
    build_example(directory)
    return directory


@pytest.mark.parametrize("extension", ["cbm", "pkl"])
def test_real_artifact_factory_across_all_forecast_views(artifacts, monkeypatch, extension):
    monkeypatch.setenv("MODEL_PATH", str(artifacts / f"example.{extension}"))
    monkeypatch.setenv("MODEL_METADATA_PATH", str(artifacts / "example.metadata.json"))
    settings = Settings(predictor_factory="app.predictors.artifact:build_predictor")
    with TestClient(create_app(settings)) as client:
        for horizon, start, end, count in [
            ("day", "2026-09-26", "2026-09-27", 24),
            ("month", "2028-02-01", "2028-03-01", 29),
            ("year", "2026-09-01", "2027-09-01", 12),
        ]:
            query = {"route_id": "demo-17", "horizon": horizon,
                     "from": start + "T00:00:00+03:00", "to": end + "T00:00:00+03:00"}
            response = client.get("/forecast", params=query)
            assert response.status_code == 200, response.text
            data = ForecastResponse.model_validate(response.json())
            assert data.model_version == "catboost-example-v1"
            assert data.is_mock is True and data.value_unit == "demo_index"
            assert len(data.points) == count
            assert [point.timestamp for point in data.points] == ForecastRequest.model_validate(query).timestamps()
            assert all(point.lower_bound is None and point.upper_bound is None for point in data.points)
            assert client.get("/forecast", params=query).json() == response.json()

            # The same route/stop/direction and instant must agree across all views.
            params = {"route_id": "demo-17", "direction_id": 0, "horizon": horizon,
                      "timestamp": query["from"], "forecast_origin": query["from"]}
            map_response = client.get("/forecast/map", params=params)
            top_response = client.get("/forecast/top-overload", params=params | {"limit": 5})
            assert map_response.status_code == top_response.status_code == 200
            points = map_response.json()["points"]
            route_stops = client.get("/routes/demo-17/stops")
            assert route_stops.status_code == 200
            expected_points = sum(
                stop["direction_id"] == 0 for stop in route_stops.json()
            )
            assert expected_points >= 5
            assert len(points) == expected_points
            first = points[0]
            series = client.get("/forecast", params=query | {
                "stop_id": first["stop_id"], "direction_id": 0,
            })
            assert series.status_code == 200
            assert series.json()["points"][0]["predicted_load"] == first["predicted_load"]
            ranked = top_response.json()["items"]
            assert len(ranked) == 5
            assert [point["predicted_load"] for point in ranked] == sorted(
                (point["predicted_load"] for point in points), reverse=True,
            )[:5]
            assert top_response.json()["model_version"] == map_response.json()["model_version"] == data.model_version

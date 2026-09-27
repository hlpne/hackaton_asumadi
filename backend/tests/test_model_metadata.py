import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_model_metadata_is_machine_readable_and_truthful():
    with TestClient(create_app(Settings())) as client:
        response = client.get("/model/metadata")

    assert response.status_code == 200
    data = response.json()
    assert data["schema_version"] == "1.0"
    assert data["coverage"] == {
        "history_from": "2025-01-01",
        "history_to": "2025-10-31",
        "forecast_from": "2025-11-01",
        "forecast_to": "2025-12-31",
        "routes": 9,
        "horizon_days": 61,
    }
    assert data["status"] == "validation_pending"
    assert data["extrapolation"]["forecast_from"] == "2026-01-01"
    assert data["extrapolation"]["forecast_to"] == "2027-12-31"
    assert "не проверена" in data["extrapolation"]["validation_status"]
    assert data["validation"]["final"]["wape"] is None
    assert data["value_unit"] == "validations"
    assert data["validation"]["platform_score"] == 0.90461
    assert data["validation"]["score_without_route5"] is None
    assert data["artifact"]["submitted_routes"] == 10
    assert data["artifact"]["displayed_routes"] == 9
    assert data["validation"]["backtests"][0]["wape"] == 8.8193
    assert len(data["validation"]["route_wape_october"]) == 9
    assert len(data["validation"]["route_wape_sep_oct"]) == 9
    assert data["artifact"]["sha256"] == "05d73ac9bff3364cd1df815c3a3bd5d4a25cdcd2d2711db9e7a5ae7e9778d901"
    assert data["artifact"]["jvm_model_calls"] == 991
    assert data["artifact"]["jvm_rounding_differences"] == 2
    assert any("Маршрут 5" in item for item in data["limitations"])


def test_metadata_json_is_the_single_source_for_the_endpoint():
    with TestClient(create_app(Settings())) as client:
        payload = client.get("/model/metadata").json()

    # The response must remain serializable for reports and external clients.
    assert json.loads(json.dumps(payload, ensure_ascii=False))["model_version"] == payload["model_version"]

import json
import pickle

from fastapi.testclient import TestClient
import pytest

from app.config import Settings
from app.main import create_app
from app.predictors.artifact import ArtifactMetadata, ArtifactPredictor, build_predictor, feature_rows
from app.predictors.base import load_predictor
from app.schemas import ForecastRequest

DAY = {"route_id": "demo-17", "horizon": "day", "from": "2026-09-26T00:00:00+03:00", "to": "2026-09-27T00:00:00+03:00"}
META = dict(
    feature_schema="tram-calendar-v1", model_version="test-model-v1",
    value_unit="test_unit", aggregation="mean", is_mock=False,
    supported_horizons=["day", "month", "year"],
)


class Estimator:
    def predict(self, rows):
        return [17.0] * len(rows)


def test_pickle_loads_once_and_keeps_domain_metadata(tmp_path, monkeypatch):
    artifact = tmp_path / "trusted.pkl"
    metadata = tmp_path / "metadata.json"
    artifact.write_bytes(pickle.dumps(Estimator()))
    metadata.write_text(json.dumps(META))
    monkeypatch.setenv("MODEL_PATH", str(artifact))
    monkeypatch.setenv("MODEL_METADATA_PATH", str(metadata))
    app = create_app(Settings(predictor_factory="app.predictors.artifact:build_predictor"))
    artifact.unlink()  # Subsequent requests must use the already loaded estimator.
    with TestClient(app) as client:
        for _ in range(2):
            response = client.get("/forecast", params=DAY)
            assert response.status_code == 200, response.text
            data = response.json()
            assert (data["is_mock"], data["value_unit"], data["model_version"]) == (False, "test_unit", "test-model-v1")
            assert data["interval_level"] is None
            assert len(data["points"]) == 24
            assert all(p["predicted_load"] == 17 and p["lower_bound"] is None and p["upper_bound"] is None for p in data["points"])


def test_features_use_moscow_time_and_preserve_series_identity():
    request = ForecastRequest.model_validate(DAY | {
        "from": "2026-09-25T21:00:00Z", "to": "2026-09-26T21:00:00Z",
        "stop_id": "demo-17-s01", "direction_id": 0,
    })
    rows = feature_rows(request)
    assert rows[0] == ["demo-17", '"demo-17-s01"', "0", "day", 0, 5, 9, 26, 0.0]
    assert rows[-1][-1] == 23
    missing = feature_rows(ForecastRequest.model_validate(DAY))[0]
    literal = feature_rows(ForecastRequest.model_validate(DAY | {"stop_id": "null"}))[0]
    assert missing[1:3] == ["null", "null"]
    assert literal[1] != missing[1]


@pytest.mark.parametrize("values", [[], [1.0] * 23, [1.0] * 25,
                                   [float("nan")] * 24, [float("inf")] * 24,
                                   [[1.0]] * 24, [True] * 24, ["1.0"] * 24])
def test_invalid_model_outputs_are_rejected_at_http_boundary(values):
    class BadEstimator:
        def predict(self, rows):
            return values
    provider = ArtifactPredictor(BadEstimator(), ArtifactMetadata(**META))
    with TestClient(create_app(Settings(), predictor=provider)) as client:
        response = client.get("/forecast", params=DAY)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "INVALID_PREDICTION"


def test_negative_model_predictions_are_clamped_and_resolution_is_preserved():
    class UnconstrainedEstimator:
        def predict(self, rows):
            return [-2.5, 3.0, -0.01, 4.0, 5.0]

    provider = ArtifactPredictor(UnconstrainedEstimator(), ArtifactMetadata(**META))
    with TestClient(create_app(Settings(), predictor=provider)) as client:
        response = client.get("/forecast", params=DAY | {
            "resolution": "PT1M",
            "from": "2026-09-26T08:15:00+03:00",
            "to": "2026-09-26T08:20:00+03:00",
        })

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["resolution"] == "PT1M"
    assert [point["predicted_load"] for point in data["points"]] == [0.0, 3.0, 0.0, 4.0, 5.0]


def test_unsupported_model_horizon_is_unavailable_without_mock_fallback():
    provider = ArtifactPredictor(Estimator(), ArtifactMetadata(**(META | {"supported_horizons": ["month"]})))
    with TestClient(create_app(Settings(), predictor=provider)) as client:
        response = client.get("/forecast", params=DAY)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PREDICTOR_UNAVAILABLE"


@pytest.mark.parametrize("defect", ["missing_model", "bad_suffix", "bad_metadata", "no_predict", "wrong_features"])
def test_bad_artifact_configuration_fails_before_serving(tmp_path, monkeypatch, defect):
    model = tmp_path / ("model.bin" if defect == "bad_suffix" else "model.pkl")
    obj = Estimator()
    if defect == "wrong_features":
        obj.feature_names_ = ["different_feature"]
    model.write_bytes(pickle.dumps(None if defect == "no_predict" else obj))
    metadata = tmp_path / "model.json"
    metadata.write_text(json.dumps(META | ({"feature_schema": "unknown"} if defect == "bad_metadata" else {})))
    if defect == "missing_model":
        model.unlink()
    monkeypatch.setenv("MODEL_PATH", str(model))
    monkeypatch.setenv("MODEL_METADATA_PATH", str(metadata))
    with pytest.raises((ValueError, TypeError, FileNotFoundError)):
        create_app(Settings(predictor_factory="app.predictors.artifact:build_predictor"))


def test_model_path_is_required(monkeypatch):
    monkeypatch.delenv("MODEL_PATH", raising=False)
    with pytest.raises(ValueError, match="MODEL_PATH"):
        build_predictor()


@pytest.mark.parametrize("path", ["", "app.predictors.mock", ":build_predictor", "app.predictors.mock:"])
def test_factory_rejects_invalid_paths(path):
    with pytest.raises(ValueError, match="module:function"):
        load_predictor(path)

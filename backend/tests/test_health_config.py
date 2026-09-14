from pathlib import Path

from fastapi.testclient import TestClient
import psycopg
import pytest

from app.catalog import MemoryCatalog
from app.config import Settings
from app.main import create_app


ENV_KEYS = (
    "APP_NAME",
    "APP_VERSION",
    "APP_ENV",
    "LOG_LEVEL",
    "CATALOG_BACKEND",
    "PREDICTOR_FACTORY",
    "DB_HOST",
    "DB_PORT",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "DB_CONNECT_TIMEOUT",
    "DB_STATEMENT_TIMEOUT_MS",
)


def test_settings_are_loaded_and_database_password_is_not_represented(tmp_path: Path, monkeypatch):
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "APP_NAME=Test API\nAPP_VERSION=9.1\nAPP_ENV=test\nLOG_LEVEL=warning\n"
        "CATALOG_BACKEND=postgres\nDB_HOST=db.internal\nDB_PORT=6432\n"
        "POSTGRES_DB=test_db\nPOSTGRES_USER=test_user\nPOSTGRES_PASSWORD=very-secret\n"
        "DB_CONNECT_TIMEOUT=7\nDB_STATEMENT_TIMEOUT_MS=4500\n",
        encoding="utf-8",
    )

    settings = Settings.from_env(env_file)

    assert settings.app_name == "Test API"
    assert settings.log_level == "WARNING"
    assert settings.database_parameters() == {
        "host": "db.internal",
        "port": 6432,
        "dbname": "test_db",
        "user": "test_user",
        "password": "very-secret",
        "connect_timeout": 7,
        "options": "-c statement_timeout=4500",
    }
    assert "very-secret" not in repr(settings)


@pytest.mark.parametrize(
    ("key", "value", "message"),
    [
        ("CATALOG_BACKEND", "redis", "CATALOG_BACKEND"),
        ("LOG_LEVEL", "TRACE", "LOG_LEVEL"),
        ("DB_PORT", "zero", "DB_PORT"),
        ("DB_CONNECT_TIMEOUT", "0", "DB_CONNECT_TIMEOUT"),
    ],
)
def test_invalid_environment_configuration_fails_fast(tmp_path: Path, monkeypatch, key, value, message):
    for env_key in ENV_KEYS:
        monkeypatch.delenv(env_key, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(f"{key}={value}\n", encoding="utf-8")

    with pytest.raises(ValueError, match=message):
        Settings.from_env(env_file)


def test_health_endpoints_expose_liveness_and_readiness():
    settings = Settings(app_name="Test API", app_version="1.2.3", app_environment="test")
    with TestClient(create_app(settings)) as client:
        live = client.get("/health/live")
        ready = client.get("/health/ready")
        compatibility = client.get("/health")

    assert live.status_code == 200
    assert live.json() == {"status": "ok", "service": "Test API", "version": "1.2.3", "environment": "test"}
    assert ready.status_code == 200
    assert ready.json()["database"] == "disabled"
    assert compatibility.json() == ready.json()


def test_liveness_stays_available_when_database_is_down():
    class BrokenCatalog(MemoryCatalog):
        def ping(self):
            raise psycopg.OperationalError("private-db-detail")

    settings = Settings(catalog_backend="postgres")
    with TestClient(create_app(settings, catalog=BrokenCatalog())) as client:
        live = client.get("/health/live")
        ready = client.get("/health/ready")

    assert live.status_code == 200
    assert ready.status_code == 503
    assert ready.json() == {
        "error": {
            "code": "DATABASE_UNAVAILABLE",
            "message": "Catalog database is unavailable",
            "details": [],
        }
    }


def test_method_errors_use_the_common_error_contract():
    with TestClient(create_app(Settings())) as client:
        response = client.post("/health")

    assert response.status_code == 405
    assert response.json() == {
        "error": {"code": "HTTP_ERROR", "message": "Method Not Allowed", "details": []}
    }

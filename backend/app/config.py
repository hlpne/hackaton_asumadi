from dataclasses import dataclass, field
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    app_name: str = "Moscow Tram Forecast API"
    app_version: str = "0.2.0"
    app_environment: str = "development"
    log_level: str = "INFO"
    catalog_backend: str = "memory"
    predictor_factory: str = "app.predictors.mock:build_predictor"
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str = "transport"
    db_user: str = "transport"
    db_password: str = field(default="transport_local_only", repr=False)
    db_connect_timeout: int = 3
    db_statement_timeout_ms: int = 3000

    @classmethod
    def from_env(cls, env_file: Path | None = None) -> "Settings":
        load_dotenv(env_file or ROOT / ".env", override=False)
        backend = os.getenv("CATALOG_BACKEND", "memory")
        if backend not in {"memory", "postgres"}:
            raise ValueError("CATALOG_BACKEND must be memory or postgres")
        log_level = os.getenv("LOG_LEVEL", "INFO").upper()
        if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR or CRITICAL")

        def positive_int(name: str, default: int) -> int:
            try:
                value = int(os.getenv(name, str(default)))
            except ValueError as exc:
                raise ValueError(f"{name} must be an integer") from exc
            if value <= 0:
                raise ValueError(f"{name} must be greater than zero")
            return value

        return cls(
            app_name=os.getenv("APP_NAME", cls.app_name),
            app_version=os.getenv("APP_VERSION", cls.app_version),
            app_environment=os.getenv("APP_ENV", cls.app_environment),
            log_level=log_level,
            catalog_backend=backend,
            predictor_factory=os.getenv("PREDICTOR_FACTORY", cls.predictor_factory),
            db_host=os.getenv("DB_HOST", cls.db_host),
            db_port=positive_int("DB_PORT", cls.db_port),
            db_name=os.getenv("POSTGRES_DB", cls.db_name),
            db_user=os.getenv("POSTGRES_USER", cls.db_user),
            db_password=os.getenv("POSTGRES_PASSWORD", cls.db_password),
            db_connect_timeout=positive_int("DB_CONNECT_TIMEOUT", cls.db_connect_timeout),
            db_statement_timeout_ms=positive_int("DB_STATEMENT_TIMEOUT_MS", cls.db_statement_timeout_ms),
        )

    def database_parameters(self) -> dict:
        """Return psycopg options without exposing credentials in logs or API models."""
        return {
            "host": self.db_host,
            "port": self.db_port,
            "dbname": self.db_name,
            "user": self.db_user,
            "password": self.db_password,
            "connect_timeout": self.db_connect_timeout,
            "options": f"-c statement_timeout={self.db_statement_timeout_ms}",
        }

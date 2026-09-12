from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    catalog_backend: str = "memory"
    predictor_factory: str = "app.predictors.mock:build_predictor"

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(ROOT / ".env", override=False)
        backend = os.getenv("CATALOG_BACKEND", "memory")
        if backend not in {"memory", "postgres"}:
            raise ValueError("CATALOG_BACKEND must be memory or postgres")
        return cls(
            catalog_backend=backend,
            predictor_factory=os.getenv("PREDICTOR_FACTORY", cls.predictor_factory),
        )


def database_parameters() -> dict:
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("POSTGRES_DB", "transport"),
        "user": os.getenv("POSTGRES_USER", "transport"),
        "password": os.getenv("POSTGRES_PASSWORD", "transport_local_only"),
        "connect_timeout": 3,
        "options": "-c statement_timeout=3000",
    }

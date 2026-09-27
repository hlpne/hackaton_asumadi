from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import psycopg


SCRIPT = Path(__file__).resolve().parents[2] / "db" / "scripts" / "import_schedule.py"


def load_importer():
    spec = spec_from_file_location("schedule_import_for_test", SCRIPT)
    assert spec and spec.loader
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_schedule_import_retries_short_database_restart(monkeypatch):
    importer = load_importer()
    sentinel = object()
    attempts = 0
    delays: list[int] = []

    def connect(**_kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise psycopg.OperationalError("database is restarting")
        return sentinel

    monkeypatch.setattr(importer.psycopg, "connect", connect)
    monkeypatch.setattr(importer, "connection_parameters", lambda: {})
    monkeypatch.setattr(importer, "sleep", delays.append)

    assert importer.connect_with_retry(attempts=3) is sentinel
    assert attempts == 2
    assert delays == [1]

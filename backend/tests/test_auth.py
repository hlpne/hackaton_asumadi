import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from app.auth import Authenticator, AuthError, Dispatcher, LoginThrottle, TooManyAttemptsError, hash_password, verify_password
from app.config import Settings
from app.main import create_app

PASSWORD = "correct-horse"


@pytest.fixture(scope="module")
def password_hash() -> str:
    return hash_password(PASSWORD, iterations=1_000)


@pytest.fixture
def client(tmp_path: Path, password_hash: str):
    users = tmp_path / "dispatchers.json"
    users.write_text(json.dumps([
        {"login": "Petrova", "full_name": "Петрова Анна", "password_hash": password_hash},
    ], ensure_ascii=False), encoding="utf-8")
    settings = Settings(auth_enabled=True, auth_users_file=users, auth_secret_key="test-secret")
    with TestClient(create_app(settings)) as instance:
        yield instance


def login(client: TestClient, password: str = PASSWORD, user: str = "petrova"):
    return client.post("/auth/login", json={"login": user, "password": password})


def test_password_hash_roundtrip_and_rejects_garbage(password_hash: str):
    assert verify_password(PASSWORD, password_hash)
    assert not verify_password("wrong", password_hash)
    assert not verify_password(PASSWORD, "not-a-hash")
    assert hash_password(PASSWORD, iterations=1_000) != password_hash


def test_protected_endpoints_require_token_and_health_stays_public(client: TestClient):
    response = client.get("/routes")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.headers["www-authenticate"] == "Bearer"
    assert client.get("/forecast/map", params={"horizon": "day"}).status_code == 401
    assert client.get("/health/live").status_code == 200


def test_login_returns_token_that_opens_the_api(client: TestClient):
    response = login(client, user="  PETROVA ")
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"] == {"login": "petrova", "full_name": "Петрова Анна"}
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    assert client.get("/routes", headers=headers).status_code == 200
    me = client.get("/auth/me", headers=headers).json()
    assert me["user"]["full_name"] == "Петрова Анна"
    assert me["expires_at"] == body["expires_at"]


def test_wrong_password_and_unknown_user_get_the_same_error(client: TestClient):
    wrong_password = login(client, "nope")
    unknown_user = login(client, user="ghost")
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


def test_tampered_or_foreign_tokens_are_rejected(client: TestClient):
    token = login(client).json()["access_token"]
    body, signature = token.split(".")
    for bad in (f"{body}.{signature[:-2]}AA", "garbage", f"{body}x.{signature}"):
        response = client.get("/routes", headers={"Authorization": f"Bearer {bad}"})
        assert response.status_code == 401


def test_repeated_failures_lock_the_login(client: TestClient):
    for _ in range(5):
        assert login(client, "nope").status_code == 401
    locked = login(client)
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"
    assert int(locked.headers["retry-after"]) > 0


def test_throttle_unlocks_after_timeout():
    now = [0.0]
    throttle = LoginThrottle(max_failures=2, lock_seconds=60, clock=lambda: now[0])
    throttle.fail("a")
    throttle.fail("a")
    with pytest.raises(TooManyAttemptsError):
        throttle.check("a")
    now[0] = 61
    throttle.check("a")


def test_expired_token_is_rejected(password_hash: str):
    now = [1_000_000.0]
    users = {"petrova": Dispatcher("petrova", "Петрова Анна", password_hash)}
    auth = Authenticator(users, "secret", token_ttl_seconds=60, clock=lambda: now[0])
    _, token, _ = auth.login("petrova", PASSWORD)
    assert auth.verify(token)[0].login == "petrova"
    now[0] += 61
    with pytest.raises(AuthError, match="истекла"):
        auth.verify(token)


def test_auth_can_be_disabled_for_programmatic_settings():
    with TestClient(create_app(Settings())) as client:
        assert client.get("/routes").status_code == 200


def test_from_env_enables_auth_and_requires_secret_in_production(tmp_path: Path, monkeypatch):
    for key in ("AUTH_ENABLED", "AUTH_SECRET_KEY", "AUTH_USERS_FILE", "APP_ENV"):
        monkeypatch.delenv(key, raising=False)
    empty_env = tmp_path / ".env"
    empty_env.write_text("", encoding="utf-8")
    assert Settings.from_env(empty_env).auth_enabled is True

    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(ValueError, match="AUTH_SECRET_KEY"):
        Settings.from_env(empty_env)
    monkeypatch.setenv("AUTH_SECRET_KEY", "prod-secret")
    assert Settings.from_env(empty_env).auth_secret_key == "prod-secret"

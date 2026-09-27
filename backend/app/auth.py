"""Dispatcher authentication: PBKDF2 password hashes and HMAC-signed bearer tokens.

Only the standard library is used, so the backend image needs no extra packages.
"""

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

HASH_ALGORITHM = "pbkdf2_sha256"
DEFAULT_ITERATIONS = 600_000


@dataclass(frozen=True)
class Dispatcher:
    login: str
    full_name: str
    password_hash: str


class AuthError(Exception):
    """Invalid credentials or token; the message is safe to show to the client."""


class TooManyAttemptsError(AuthError):
    def __init__(self, retry_after: int):
        super().__init__("Слишком много неудачных попыток входа. Повторите позже.")
        self.retry_after = retry_after


def hash_password(password: str, *, iterations: int = DEFAULT_ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{HASH_ALGORITHM}${iterations}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != HASH_ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), _unb64(salt), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, _unb64(expected))


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def load_dispatchers(path: Path) -> dict[str, Dispatcher]:
    """Read `[{"login", "full_name", "password_hash"}]`; a missing file means no accounts."""
    if not path.exists():
        return {}
    items = json.loads(path.read_text(encoding="utf-8"))
    return {
        item["login"].strip().lower(): Dispatcher(
            login=item["login"].strip().lower(),
            full_name=item["full_name"],
            password_hash=item["password_hash"],
        )
        for item in items
    }


class LoginThrottle:
    """Lock a login for `lock_seconds` after `max_failures` consecutive failures."""

    def __init__(self, max_failures: int = 5, lock_seconds: int = 300, clock=time.monotonic):
        self.max_failures = max_failures
        self.lock_seconds = lock_seconds
        self.clock = clock
        self._failures: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def check(self, login: str) -> None:
        with self._lock:
            count, locked_until = self._failures.get(login, (0, 0.0))
            remaining = locked_until - self.clock()
            if count >= self.max_failures and remaining > 0:
                raise TooManyAttemptsError(int(remaining) + 1)
            if count >= self.max_failures:
                self._failures.pop(login, None)

    def fail(self, login: str) -> None:
        with self._lock:
            count, _ = self._failures.get(login, (0, 0.0))
            count += 1
            locked_until = self.clock() + self.lock_seconds if count >= self.max_failures else 0.0
            self._failures[login] = (count, locked_until)

    def succeed(self, login: str) -> None:
        with self._lock:
            self._failures.pop(login, None)


class Authenticator:
    def __init__(
        self,
        dispatchers: dict[str, Dispatcher],
        secret_key: str,
        token_ttl_seconds: int,
        throttle: LoginThrottle | None = None,
        clock=time.time,
    ):
        self.dispatchers = dispatchers
        self._key = secret_key.encode("utf-8")
        self.token_ttl_seconds = token_ttl_seconds
        self.throttle = throttle or LoginThrottle()
        self.clock = clock

    @cached_property
    def _dummy_hash(self) -> str:
        # Verifying against a dummy hash keeps response time equal for unknown logins.
        return hash_password(secrets.token_urlsafe(16))

    def login(self, login: str, password: str) -> tuple[Dispatcher, str, int]:
        key = login.strip().lower()
        self.throttle.check(key)
        dispatcher = self.dispatchers.get(key)
        valid = verify_password(password, dispatcher.password_hash if dispatcher else self._dummy_hash)
        if dispatcher is None or not valid:
            self.throttle.fail(key)
            raise AuthError("Неверный логин или пароль")
        self.throttle.succeed(key)
        expires_at = int(self.clock()) + self.token_ttl_seconds
        return dispatcher, self._sign({"sub": dispatcher.login, "exp": expires_at}), expires_at

    def verify(self, token: str) -> tuple[Dispatcher, int]:
        try:
            body, signature = token.split(".")
            expected = hmac.new(self._key, body.encode("ascii"), hashlib.sha256).digest()
            if not hmac.compare_digest(_unb64(signature), expected):
                raise ValueError
            payload = json.loads(_unb64(body))
            login, expires_at = payload["sub"], int(payload["exp"])
        except (ValueError, KeyError, TypeError, UnicodeError):
            raise AuthError("Сессия недействительна, войдите снова") from None
        if expires_at <= self.clock():
            raise AuthError("Сессия истекла, войдите снова")
        dispatcher = self.dispatchers.get(login)
        if dispatcher is None:
            raise AuthError("Учётная запись отключена")
        return dispatcher, expires_at

    def _sign(self, payload: dict) -> str:
        body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signature = hmac.new(self._key, body.encode("ascii"), hashlib.sha256).digest()
        return f"{body}.{_b64(signature)}"

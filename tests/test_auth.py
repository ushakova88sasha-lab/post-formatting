import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")
os.environ.setdefault("TELEGRAM_CHANNEL_ID", "@test_channel")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-32-characters-long")

from app.main import app  # noqa: E402

client = TestClient(app)


def test_me_requires_auth():
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_login_sets_session_cookie_with_root_path():
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-password"},
    )
    assert response.status_code == 200
    cookie = response.cookies.get("session")
    assert cookie

    set_cookie = response.headers.get("set-cookie", "")
    assert "Path=/" in set_cookie or "path=/" in set_cookie.lower()

    me = client.get("/api/auth/me", cookies={"session": cookie})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_wrong_password_does_not_set_cookie():
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401
    assert not response.cookies.get("session")

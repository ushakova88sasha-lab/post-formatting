import os
from pathlib import Path

import pytest

TEST_DB = Path(__file__).resolve().parent.parent / "data" / "test_posts.db"

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456789:AAHtesttoken1234567890")
os.environ.setdefault("TELEGRAM_CHANNEL_ID", "@test_channel")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-32-characters-long")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ.setdefault("PUBLIC_BASE_URL", "http://testserver")

from app.database import init_db  # noqa: E402
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def ensure_db():
    TEST_DB.parent.mkdir(parents=True, exist_ok=True)
    if TEST_DB.exists():
        TEST_DB.unlink()
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_cookies(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-password"},
    )
    assert response.status_code == 200
    cookie = response.cookies.get("session")
    return {"session": cookie}

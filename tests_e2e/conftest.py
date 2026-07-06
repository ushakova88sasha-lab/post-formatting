"""Общие фикстуры для end-to-end проверок в реальном браузере (Playwright).

Эти тесты поднимают настоящий сервер приложения и открывают страницу в headless
Chromium — они проверяют то, что обычные pytest-тесты в tests/ не видят:
поведение JS в визуальном редакторе (форматирование, превью, загрузка медиа).

Запуск:
    pip install -r tests_e2e/requirements.txt
    playwright install --with-deps chromium
    pytest tests_e2e
"""

import os
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn

TEST_DB = Path(__file__).resolve().parent.parent / "data" / "test_e2e_posts.db"

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456789:AAHtesttoken1234567890")
os.environ.setdefault("TELEGRAM_CHANNEL_ID", "@test_channel")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-password-e2e")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-32-characters-long")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def live_server():
    if TEST_DB.exists():
        TEST_DB.unlink()

    port = _free_port()
    os.environ["PUBLIC_BASE_URL"] = f"http://127.0.0.1:{port}"

    from app.main import app

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    for _ in range(100):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                break
        except OSError:
            time.sleep(0.1)
    else:
        raise RuntimeError("Тестовый сервер не поднялся")

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture
def app_page(live_server, page):
    """Открытая и авторизованная страница редактора с новым черновиком."""
    page.goto(f"{live_server}/login")
    page.fill("#username", "admin")
    page.fill("#password", "test-password-e2e")
    page.click("button[type=submit]")
    page.wait_for_url(f"{live_server}/", timeout=10000)

    page.click("#new-post-btn")
    page.wait_for_selector("#editor-view:not(.hidden)", timeout=10000)
    return page

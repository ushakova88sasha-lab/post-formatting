from app.config import settings
from app.telegram_http import telegram_client_kwargs


def test_telegram_client_has_no_proxy_by_default(monkeypatch):
    monkeypatch.setattr(settings, "telegram_proxy_url", "")

    kwargs = telegram_client_kwargs(timeout=15.0)

    assert kwargs == {"timeout": 15.0}


def test_telegram_client_uses_configured_proxy(monkeypatch):
    monkeypatch.setattr(settings, "telegram_proxy_url", " http://proxy.example.com:8080 ")

    kwargs = telegram_client_kwargs(timeout=30.0)

    assert kwargs == {
        "timeout": 30.0,
        "proxy": "http://proxy.example.com:8080",
    }

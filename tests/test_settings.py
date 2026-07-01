def test_settings_telegram_requires_auth(client):
    response = client.get("/api/settings/telegram")
    assert response.status_code == 401


def test_settings_telegram_get(client, auth_cookies):
    response = client.get("/api/settings/telegram", cookies=auth_cookies)
    assert response.status_code == 200
    data = response.json()
    assert data["channel_id"] == "@test_channel"
    assert data["token_configured"] is True
    assert data["token_hint"].startswith("••••")


def test_settings_telegram_update_channel(client, auth_cookies):
    response = client.put(
        "/api/settings/telegram",
        cookies=auth_cookies,
        json={"channel_id": "@new_channel"},
    )
    assert response.status_code == 200
    assert response.json()["channel_id"] == "@new_channel"

    get_response = client.get("/api/settings/telegram", cookies=auth_cookies)
    assert get_response.json()["channel_id"] == "@new_channel"


def test_settings_telegram_update_requires_token_when_missing(client, auth_cookies, monkeypatch):
    monkeypatch.setattr("app.settings_store.get_bot_token", lambda db=None: "")

    response = client.put(
        "/api/settings/telegram",
        cookies=auth_cookies,
        json={"channel_id": "@only_channel"},
    )
    assert response.status_code == 400
    assert "токен" in response.json()["detail"].lower()

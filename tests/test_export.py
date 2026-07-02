def test_export_telegram_markdown(client, auth_cookies):
    response = client.post(
        "/api/posts/export/telegram-markdown",
        json={"content": "Строка 1\nСтрока 2"},
        cookies=auth_cookies,
    )
    assert response.status_code == 200
    markdown = response.json()["markdown"]
    assert "Строка 1<br>" in markdown
    assert "Строка 2" in markdown

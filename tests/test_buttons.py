from unittest.mock import AsyncMock, patch

from app.database import PostButton


def test_create_post_with_buttons(client, auth_cookies):
    response = client.post(
        "/api/posts",
        json={
            "title": "С кнопками",
            "content": "Текст",
            "buttons": [
                {"text": "Купить", "url": "https://example.com/buy"},
                {"text": "Подробнее", "url": "https://example.com/info"},
            ],
        },
        cookies=auth_cookies,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["buttons"]) == 2
    assert data["buttons"][0]["text"] == "Купить"
    assert data["buttons"][0]["click_count"] == 0
    assert data["buttons"][0]["track_url"].startswith("http://testserver/go/")


def test_update_post_replaces_buttons(client, auth_cookies):
    created = client.post(
        "/api/posts",
        json={"title": "Тест", "content": "Текст", "buttons": [{"text": "A", "url": "https://a.test"}]},
        cookies=auth_cookies,
    ).json()

    updated = client.put(
        f"/api/posts/{created['id']}",
        json={
            "buttons": [{"text": "B", "url": "https://b.test"}],
        },
        cookies=auth_cookies,
    )
    assert updated.status_code == 200
    buttons = updated.json()["buttons"]
    assert len(buttons) == 1
    assert buttons[0]["text"] == "B"


def test_invalid_button_url_rejected(client, auth_cookies):
    response = client.post(
        "/api/posts",
        json={
            "title": "Ошибка",
            "content": "Текст",
            "buttons": [{"text": "Кнопка", "url": "ftp://bad.example"}],
        },
        cookies=auth_cookies,
    )
    assert response.status_code == 400


def test_click_redirect_counts_and_redirects(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={
            "title": "Клики",
            "content": "Текст",
            "buttons": [{"text": "Сайт", "url": "https://example.com/landing"}],
        },
        cookies=auth_cookies,
    ).json()
    token = post["buttons"][0]["track_url"].rsplit("/", 1)[-1]

    redirect = client.get(f"/go/{token}", follow_redirects=False)
    assert redirect.status_code == 302
    assert redirect.headers["location"] == "https://example.com/landing"

    refreshed = client.get(f"/api/posts/{post['id']}", cookies=auth_cookies).json()
    assert refreshed["buttons"][0]["click_count"] == 1


def test_unique_clicks_count_once_per_visitor(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={
            "title": "Уникальные клики",
            "content": "Текст",
            "buttons": [{"text": "Сайт", "url": "https://example.com"}],
        },
        cookies=auth_cookies,
    ).json()
    token = post["buttons"][0]["track_url"].rsplit("/", 1)[-1]

    for _ in range(3):
        response = client.get(f"/go/{token}", follow_redirects=False)
        assert response.status_code == 302

    refreshed = client.get(f"/api/posts/{post['id']}", cookies=auth_cookies).json()
    assert refreshed["buttons"][0]["click_count"] == 1


def test_empty_button_url_rejected(client, auth_cookies):
    response = client.post(
        "/api/posts",
        json={
            "title": "Ошибка",
            "content": "Текст",
            "buttons": [{"text": "Кнопка", "url": ""}],
        },
        cookies=auth_cookies,
    )
    assert response.status_code == 400


def test_publish_sends_inline_keyboard(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={
            "title": "Публикация",
            "content": "Текст поста",
            "buttons": [{"text": "Перейти", "url": "https://example.com"}],
        },
        cookies=auth_cookies,
    ).json()

    with patch("app.routers.posts.publish_post_to_telegram", new_callable=AsyncMock) as publish_mock:
        publish_mock.return_value = 12345
        response = client.post(f"/api/posts/{post['id']}/publish", cookies=auth_cookies)

    assert response.status_code == 200
    publish_mock.assert_awaited_once()


def test_delete_post_cascades_buttons(client, auth_cookies, ensure_db):
    from app.database import SessionLocal

    post = client.post(
        "/api/posts",
        json={
            "title": "Удаление",
            "content": "Текст",
            "buttons": [{"text": "Сайт", "url": "https://example.com"}],
        },
        cookies=auth_cookies,
    ).json()

    response = client.delete(f"/api/posts/{post['id']}", cookies=auth_cookies)
    assert response.status_code == 200

    db = SessionLocal()
    try:
        assert db.query(PostButton).filter(PostButton.post_id == post["id"]).count() == 0
    finally:
        db.close()

from datetime import datetime
from unittest.mock import AsyncMock, patch

from app.database import Post, PostLink, PostStatus, PublishedPostLog, SessionLocal


def test_monthly_stats_empty(client, auth_cookies):
    response = client.get("/api/settings/stats", cookies=auth_cookies)
    assert response.status_code == 200
    data = response.json()
    assert data["retention_months"] == 3
    assert len(data["months"]) == 3
    assert data["total"] >= 0
    assert sum(month["count"] for month in data["months"]) == data["total"]


def test_publish_logs_monthly_stats(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={"title": "Статистика", "content": "Текст"},
        cookies=auth_cookies,
    ).json()

    with patch("app.routers.posts.publish_post_to_telegram", new_callable=AsyncMock) as publish_mock:
        publish_mock.return_value = 42
        with patch("app.publish.refresh_post_channel_stats", new_callable=AsyncMock):
            response = client.post(f"/api/posts/{post['id']}/publish", cookies=auth_cookies)

    assert response.status_code == 200
    publish_mock.assert_awaited_once()

    stats = client.get("/api/settings/stats", cookies=auth_cookies).json()
    assert stats["total"] >= 1
    assert any(month["count"] >= 1 for month in stats["months"])


def test_tracking_settings_roundtrip(client, auth_cookies):
    updated = client.put(
        "/api/settings/tracking",
        json={
            "enabled": True,
            "utm_source": "tg",
            "utm_medium": "newsletter",
            "utm_campaign": "march_{post_id}",
        },
        cookies=auth_cookies,
    )
    assert updated.status_code == 200
    assert updated.json()["utm_source"] == "tg"

    fetched = client.get("/api/settings/tracking", cookies=auth_cookies).json()
    assert fetched["utm_medium"] == "newsletter"


def test_content_link_tracking_and_click(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={
            "title": "Ссылки",
            "content": "Читайте [сайт](https://example.com/page) и https://example.org",
        },
        cookies=auth_cookies,
    ).json()

    with patch("app.publish.send_message", new_callable=AsyncMock) as send_mock:
        send_mock.return_value = 100
        with patch("app.publish.refresh_post_channel_stats", new_callable=AsyncMock):
            client.post(f"/api/posts/{post['id']}/publish", cookies=auth_cookies)

    db = SessionLocal()
    try:
        links = db.query(PostLink).filter(PostLink.post_id == post["id"]).all()
        assert len(links) == 2
        token = links[0].click_token
    finally:
        db.close()

    redirect = client.get(f"/go/{token}", follow_redirects=False)
    assert redirect.status_code == 302
    assert redirect.headers["location"].startswith("https://example.com/page")


def test_post_stats_endpoint(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={
            "title": "Stats API",
            "content": "Текст",
            "buttons": [{"text": "Кнопка", "url": "https://example.com"}],
        },
        cookies=auth_cookies,
    ).json()

    with patch("app.routers.posts.publish_post_to_telegram", new_callable=AsyncMock) as publish_mock:
        publish_mock.return_value = 55
        with patch("app.routers.posts.finalize_published_post", new_callable=AsyncMock):
            client.post(f"/api/posts/{post['id']}/publish", cookies=auth_cookies)

    stats = client.get(f"/api/posts/{post['id']}/stats", cookies=auth_cookies)
    assert stats.status_code == 200
    data = stats.json()
    assert data["telegram_message_id"] == 55
    assert len(data["buttons"]) == 1
    assert "channel_stats" in data


def test_post_stats_only_for_published(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={"title": "Draft", "content": "Текст"},
        cookies=auth_cookies,
    ).json()

    response = client.get(f"/api/posts/{post['id']}/stats", cookies=auth_cookies)
    assert response.status_code == 400


def test_backfill_adds_existing_published_posts(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={"title": "Старый пост", "content": "Текст [ссылка](https://example.com/old)"},
        cookies=auth_cookies,
    ).json()

    db = SessionLocal()
    try:
        row = db.get(Post, post["id"])
        row.status = PostStatus.PUBLISHED.value
        row.published_at = datetime.utcnow()
        row.telegram_message_id = 999
        db.commit()
    finally:
        db.close()

    backfill = client.post("/api/settings/stats/backfill", cookies=auth_cookies)
    assert backfill.status_code == 200
    data = backfill.json()
    assert data["logs_added"] >= 1
    assert data["links_synced"] >= 1

    stats = client.get("/api/settings/stats", cookies=auth_cookies).json()
    assert stats["total"] >= 1

    post_stats = client.get(f"/api/posts/{post['id']}/stats", cookies=auth_cookies)
    assert post_stats.status_code == 200
    assert len(post_stats.json()["links"]) == 1


def test_published_log_survives_post_deletion(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={"title": "Удаляемый", "content": "Текст"},
        cookies=auth_cookies,
    ).json()

    with patch("app.routers.posts.publish_post_to_telegram", new_callable=AsyncMock) as publish_mock:
        publish_mock.return_value = 77
        with patch("app.publish.refresh_post_channel_stats", new_callable=AsyncMock):
            client.post(f"/api/posts/{post['id']}/publish", cookies=auth_cookies)

    client.delete(f"/api/posts/{post['id']}", cookies=auth_cookies)

    db = SessionLocal()
    try:
        logs = db.query(PublishedPostLog).filter(PublishedPostLog.title == "Удаляемый").all()
        assert len(logs) == 1
        assert logs[0].post_id == post["id"]
    finally:
        db.close()

    stats = client.get("/api/settings/stats", cookies=auth_cookies).json()
    assert stats["total"] >= 1

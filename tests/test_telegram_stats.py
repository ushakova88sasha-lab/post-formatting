from datetime import datetime
from unittest.mock import AsyncMock, patch

from app.database import Post, PostChannelStats, PostStatus, SessionLocal
from app.telegram_stats import (
    capture_channel_stats_at_publish,
    channel_stats_to_dict,
    refresh_post_channel_stats,
)


def test_subscribers_captured_at_publish_and_not_overwritten():
    async def _run():
        db = SessionLocal()
        try:
            post = Post(
                title="Подписчики",
                content="Текст",
                status=PostStatus.PUBLISHED.value,
                published_at=datetime.utcnow(),
                telegram_message_id=123,
            )
            db.add(post)
            db.commit()
            db.refresh(post)

            with patch(
                "app.telegram_stats._fetch_channel_subscribers",
                new_callable=AsyncMock,
                return_value=1000,
            ):
                with patch(
                    "app.telegram_stats._fetch_channel_username",
                    new_callable=AsyncMock,
                    return_value="my_channel",
                ):
                    await capture_channel_stats_at_publish(db, post)
            db.commit()
            db.refresh(post)

            assert post.channel_stats.channel_subscribers_at_publish == 1000

            with patch(
                "app.telegram_stats._fetch_channel_username",
                new_callable=AsyncMock,
                return_value="my_channel",
            ):
                with patch(
                    "app.telegram_stats._fetch_channel_subscribers",
                    new_callable=AsyncMock,
                    return_value=5000,
                ) as subscribers_mock:
                    await refresh_post_channel_stats(db, post)
                    subscribers_mock.assert_not_called()

            db.commit()
            db.refresh(post)

            assert post.channel_stats.channel_subscribers_at_publish == 1000

            payload = channel_stats_to_dict(post.channel_stats, post, db)
            assert payload["channel_subscribers_at_publish"] == 1000
        finally:
            db.close()

    import asyncio

    asyncio.run(_run())


def test_post_stats_api_returns_subscribers_at_publish(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={"title": "API subscribers", "content": "Текст"},
        cookies=auth_cookies,
    ).json()

    with patch("app.routers.posts.publish_post_to_telegram", new_callable=AsyncMock) as publish_mock:
        publish_mock.return_value = 88
        with patch(
            "app.publish.capture_channel_stats_at_publish",
            new_callable=AsyncMock,
        ) as capture_mock:
            async def _capture(db, published_post):
                stats = PostChannelStats(
                    post_id=published_post.id,
                    channel_subscribers_at_publish=321,
                )
                db.add(stats)
                db.flush()

            capture_mock.side_effect = _capture
            client.post(f"/api/posts/{post['id']}/publish", cookies=auth_cookies)

    response = client.get(f"/api/posts/{post['id']}/stats", cookies=auth_cookies)
    assert response.status_code == 200
    assert response.json()["channel_stats"]["channel_subscribers_at_publish"] == 321

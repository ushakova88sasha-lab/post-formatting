from datetime import datetime, timedelta

from app.config import settings
from app.database import Post, PostStatus, SessionLocal
from app.post_retention import purge_expired_posts, retention_cutoff


def test_retention_cutoff_uses_config():
    cutoff = retention_cutoff()
    expected = datetime.utcnow() - timedelta(days=settings.post_retention_days)
    assert abs((cutoff - expected).total_seconds()) < 2


def test_purge_expired_posts_deletes_old_records():
    db = SessionLocal()
    try:
        old = Post(
            title="Старый",
            content="текст",
            status=PostStatus.PUBLISHED.value,
            created_at=datetime.utcnow() - timedelta(days=settings.post_retention_days + 1),
            updated_at=datetime.utcnow() - timedelta(days=settings.post_retention_days + 1),
        )
        fresh = Post(title="Свежий", content="текст", status=PostStatus.DRAFT.value)
        db.add(old)
        db.add(fresh)
        db.commit()
        old_id = old.id
        fresh_id = fresh.id

        removed = purge_expired_posts(db)
        assert removed == 1
        assert db.get(Post, old_id) is None
        assert db.get(Post, fresh_id) is not None

        db.delete(db.get(Post, fresh_id))
        db.commit()
    finally:
        db.close()


def test_list_posts_returns_retention_days(client, auth_cookies):
    response = client.get("/api/posts", cookies=auth_cookies)
    assert response.status_code == 200
    data = response.json()
    assert "posts" in data
    assert data["retention_days"] == settings.post_retention_days

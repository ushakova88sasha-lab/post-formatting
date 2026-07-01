from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.database import Post, PostStatus, SessionLocal


def retention_cutoff() -> datetime:
    return datetime.utcnow() - timedelta(days=settings.post_retention_days)


def purge_expired_posts(db: Session) -> int:
    """Удаляет посты старше срока хранения. Возвращает число удалённых."""
    from app.scheduler import cancel_scheduled_post

    expired = db.query(Post).filter(Post.created_at < retention_cutoff()).all()
    if not expired:
        return 0

    for post in expired:
        if post.status == PostStatus.SCHEDULED.value:
            cancel_scheduled_post(post.id)
        db.delete(post)

    db.commit()
    return len(expired)


def purge_expired_posts_session() -> int:
    db = SessionLocal()
    try:
        return purge_expired_posts(db)
    finally:
        db.close()

from sqlalchemy.orm import Session

from app.database import Post, PostStatus, PublishedPostLog
from app.stats_publish_log import log_published_post
from app.telegram_stats import refresh_post_channel_stats
from app.tracking import sync_post_links_from_content


def _logged_post_ids(db: Session) -> set[int]:
    rows = (
        db.query(PublishedPostLog.post_id)
        .filter(PublishedPostLog.post_id.isnot(None))
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def backfill_publish_logs(db: Session) -> int:
    posts = db.query(Post).filter(Post.status == PostStatus.PUBLISHED.value).all()
    logged_ids = _logged_post_ids(db)
    added = 0

    for post in posts:
        if post.id in logged_ids:
            continue
        log_published_post(db, post)
        logged_ids.add(post.id)
        added += 1

    if added:
        db.commit()
    return added


def backfill_post_links(db: Session, post_id: int | None = None) -> int:
    query = db.query(Post).filter(Post.status == PostStatus.PUBLISHED.value)
    if post_id is not None:
        query = query.filter(Post.id == post_id)
    posts = query.all()

    synced = 0
    for post in posts:
        if not post.content.strip():
            continue
        sync_post_links_from_content(db, post.id, post.content)
        synced += 1

    if synced:
        db.commit()
    return synced


async def backfill_channel_stats(db: Session, post_id: int | None = None) -> int:
    query = db.query(Post).filter(Post.status == PostStatus.PUBLISHED.value)
    if post_id is not None:
        query = query.filter(Post.id == post_id)
    posts = query.all()

    refreshed = 0
    for post in posts:
        if post.channel_stats and post.channel_stats.fetched_at:
            continue
        await refresh_post_channel_stats(db, post)
        refreshed += 1

    if refreshed:
        db.commit()
    return refreshed


async def backfill_published_posts(db: Session) -> dict:
    """Полный бэкфилл при старте: логи, ссылки, Telegram-данные."""
    logs_added = backfill_publish_logs(db)
    links_synced = backfill_post_links(db)
    stats_refreshed = await backfill_channel_stats(db)

    published_count = (
        db.query(Post).filter(Post.status == PostStatus.PUBLISHED.value).count()
    )

    return {
        "published_posts": published_count,
        "logs_added": logs_added,
        "links_synced": links_synced,
        "stats_refreshed": stats_refreshed,
    }


async def ensure_post_stats_ready(db: Session, post: Post) -> None:
    """Подгружает недостающие данные для одного опубликованного поста."""
    logged_ids = _logged_post_ids(db)
    changed = False

    if post.id not in logged_ids:
        log_published_post(db, post)
        changed = True

    if post.content.strip():
        sync_post_links_from_content(db, post.id, post.content)
        changed = True

    if not post.channel_stats or not post.channel_stats.fetched_at:
        await refresh_post_channel_stats(db, post)
        changed = True

    if changed:
        db.commit()
        db.refresh(post)

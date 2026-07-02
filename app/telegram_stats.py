import json
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.database import Post, PostChannelStats
from app.settings_store import get_bot_token, get_channel_id

_STATS_NOTE = (
    "Просмотры и пересылки отдельного поста Telegram Bot API не отдаёт. "
    "Откройте пост по ссылке в Telegram для просмотра статистики канала."
)


def _channel_slug(channel_id: str) -> str | None:
    channel = (channel_id or "").strip()
    if not channel:
        return None
    if channel.startswith("@"):
        return channel[1:]
    if channel.startswith("-100"):
        return channel[4:]
    if channel.startswith("-"):
        return channel[1:]
    return channel


def build_telegram_post_url(
    *,
    channel_id: str,
    message_id: int | None,
    channel_username: str | None = None,
) -> str | None:
    if not message_id:
        return None

    if channel_username:
        slug = channel_username.lstrip("@")
        return f"https://t.me/{slug}/{message_id}"

    slug = _channel_slug(channel_id)
    if not slug:
        return None

    if (channel_id or "").strip().startswith("@"):
        return f"https://t.me/{slug}/{message_id}"

    return f"https://t.me/c/{slug}/{message_id}"


async def _fetch_channel_subscribers(token: str, channel_id: str) -> int | None:
    url = f"https://api.telegram.org/bot{token}/getChatMemberCount"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params={"chat_id": channel_id})
        data = response.json()
    if not data.get("ok"):
        return None
    return int(data.get("result", 0))


async def _fetch_channel_username(token: str, channel_id: str) -> str | None:
    url = f"https://api.telegram.org/bot{token}/getChat"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params={"chat_id": channel_id})
        data = response.json()
    if not data.get("ok"):
        return None
    username = data.get("result", {}).get("username")
    return username if username else None


def _get_or_create_stats(db: Session, post: Post) -> PostChannelStats:
    stats = post.channel_stats
    if not stats:
        stats = PostChannelStats(post_id=post.id)
        db.add(stats)
    return stats


def _read_extra(stats: PostChannelStats | None) -> dict:
    if not stats or not stats.reactions_json:
        return {}
    try:
        return json.loads(stats.reactions_json)
    except json.JSONDecodeError:
        return {}


def _write_extra(stats: PostChannelStats, extra: dict) -> None:
    stats.reactions_json = json.dumps(extra, ensure_ascii=False)


async def capture_channel_stats_at_publish(db: Session, post: Post) -> PostChannelStats:
    """Фиксирует подписчиков канала в момент публикации поста."""
    token = get_bot_token(db)
    channel_id = get_channel_id(db)
    stats = _get_or_create_stats(db, post)

    stats.fetched_at = datetime.utcnow()
    stats.views = None
    stats.forwards = None

    if not token or not channel_id:
        stats.error_message = "Укажите токен бота и канал в настройках"
        db.flush()
        return stats

    if not post.telegram_message_id:
        stats.error_message = "Пост ещё не опубликован в Telegram"
        db.flush()
        return stats

    try:
        subscribers = await _fetch_channel_subscribers(token, channel_id)
        channel_username = await _fetch_channel_username(token, channel_id)
    except Exception as exc:
        stats.error_message = f"Не удалось получить данные канала: {exc}"
        db.flush()
        return stats

    stats.channel_subscribers_at_publish = subscribers
    extra = {
        "telegram_post_url": build_telegram_post_url(
            channel_id=channel_id,
            message_id=post.telegram_message_id,
            channel_username=channel_username,
        ),
        "note": _STATS_NOTE,
    }
    _write_extra(stats, extra)
    stats.error_message = None
    db.flush()
    return stats


async def refresh_post_channel_stats(db: Session, post: Post) -> PostChannelStats:
    """Обновляет ссылку на пост, не меняя подписчиков на момент публикации."""
    token = get_bot_token(db)
    channel_id = get_channel_id(db)
    stats = _get_or_create_stats(db, post)
    extra = _read_extra(stats)

    stats.fetched_at = datetime.utcnow()

    if not token or not channel_id:
        stats.error_message = "Укажите токен бота и канал в настройках"
        db.flush()
        return stats

    if not post.telegram_message_id:
        stats.error_message = "Пост ещё не опубликован в Telegram"
        db.flush()
        return stats

    try:
        channel_username = await _fetch_channel_username(token, channel_id)
    except Exception as exc:
        stats.error_message = f"Не удалось обновить данные канала: {exc}"
        db.flush()
        return stats

    extra["telegram_post_url"] = build_telegram_post_url(
        channel_id=channel_id,
        message_id=post.telegram_message_id,
        channel_username=channel_username,
    )
    extra.setdefault("note", _STATS_NOTE)
    _write_extra(stats, extra)
    stats.error_message = None
    db.flush()
    return stats


def channel_stats_to_dict(stats: PostChannelStats | None, post: Post, db: Session) -> dict:
    channel_id = get_channel_id(db)
    extra = _read_extra(stats)

    subscribers = stats.channel_subscribers_at_publish if stats else None
    if subscribers is None:
        subscribers = extra.get("channel_subscribers")

    post_url = extra.get("telegram_post_url") or build_telegram_post_url(
        channel_id=channel_id,
        message_id=post.telegram_message_id,
    )

    return {
        "views": stats.views if stats else None,
        "forwards": stats.forwards if stats else None,
        "channel_subscribers_at_publish": subscribers,
        "telegram_post_url": post_url,
        "note": extra.get("note"),
        "fetched_at": stats.fetched_at.isoformat() + "Z" if stats and stats.fetched_at else None,
        "error_message": stats.error_message if stats else None,
    }


async def refresh_recent_published_stats(db: Session, limit: int = 50) -> int:
    from app.database import PostStatus

    posts = (
        db.query(Post)
        .filter(
            Post.status == PostStatus.PUBLISHED.value,
            Post.telegram_message_id.isnot(None),
        )
        .order_by(Post.published_at.desc())
        .limit(limit)
        .all()
    )
    for post in posts:
        await refresh_post_channel_stats(db, post)
    if posts:
        db.commit()
    return len(posts)

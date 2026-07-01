"""Хранение настроек Telegram в SQLite (перекрывают .env)."""

from sqlalchemy.orm import Session

from app.config import settings
from app.database import AppSetting, SessionLocal

KEY_BOT_TOKEN = "telegram_bot_token"
KEY_CHANNEL_ID = "telegram_channel_id"


def _get(db: Session, key: str) -> str | None:
    row = db.get(AppSetting, key)
    return row.value if row and row.value else None


def _set(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


def seed_from_env() -> None:
    db = SessionLocal()
    try:
        if settings.telegram_bot_token and not _get(db, KEY_BOT_TOKEN):
            _set(db, KEY_BOT_TOKEN, settings.telegram_bot_token)
        if settings.telegram_channel_id and not _get(db, KEY_CHANNEL_ID):
            _set(db, KEY_CHANNEL_ID, settings.telegram_channel_id)
    finally:
        db.close()


def get_bot_token(db: Session | None = None) -> str:
    if db is not None:
        return _get(db, KEY_BOT_TOKEN) or settings.telegram_bot_token or ""

    with SessionLocal() as session:
        return _get(session, KEY_BOT_TOKEN) or settings.telegram_bot_token or ""


def get_channel_id(db: Session | None = None) -> str:
    if db is not None:
        return _get(db, KEY_CHANNEL_ID) or settings.telegram_channel_id or ""

    with SessionLocal() as session:
        return _get(session, KEY_CHANNEL_ID) or settings.telegram_channel_id or ""


def save_telegram_settings(
    db: Session,
    *,
    bot_token: str | None,
    channel_id: str,
) -> None:
    channel = channel_id.strip()
    if not channel:
        raise ValueError("Укажите канал")

    if bot_token is not None and bot_token.strip():
        _set(db, KEY_BOT_TOKEN, bot_token.strip())
    elif not get_bot_token(db):
        raise ValueError("Укажите токен бота")

    _set(db, KEY_CHANNEL_ID, channel)


def mask_token(token: str) -> str:
    token = token.strip()
    if not token:
        return ""
    if len(token) <= 8:
        return "••••••••"
    return f"••••{token[-4:]}"

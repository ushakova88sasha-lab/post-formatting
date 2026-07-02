"""Хранение настроек Telegram в SQLite (перекрывают .env)."""

from sqlalchemy.orm import Session

from app.config import settings
from app.database import AppSetting, SessionLocal

KEY_BOT_TOKEN = "telegram_bot_token"
KEY_CHANNEL_ID = "telegram_channel_id"
KEY_TRACKING_ENABLED = "tracking_enabled"
KEY_TRACKING_UTM_SOURCE = "tracking_utm_source"
KEY_TRACKING_UTM_MEDIUM = "tracking_utm_medium"
KEY_TRACKING_UTM_CAMPAIGN = "tracking_utm_campaign"


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


def get_tracking_settings(db: Session | None = None) -> dict:
    session = db if db is not None else SessionLocal()
    try:
        enabled_raw = _get(session, KEY_TRACKING_ENABLED)
        enabled = enabled_raw != "0" if enabled_raw is not None else True
        return {
            "enabled": enabled,
            "utm_source": _get(session, KEY_TRACKING_UTM_SOURCE) or "telegram",
            "utm_medium": _get(session, KEY_TRACKING_UTM_MEDIUM) or "channel",
            "utm_campaign": _get(session, KEY_TRACKING_UTM_CAMPAIGN) or "post_{post_id}",
        }
    finally:
        if db is None:
            session.close()


def save_tracking_settings(
    db: Session,
    *,
    enabled: bool | None = None,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
) -> dict:
    if enabled is not None:
        _set(db, KEY_TRACKING_ENABLED, "1" if enabled else "0")
    if utm_source is not None:
        _set(db, KEY_TRACKING_UTM_SOURCE, utm_source.strip())
    if utm_medium is not None:
        _set(db, KEY_TRACKING_UTM_MEDIUM, utm_medium.strip())
    if utm_campaign is not None:
        _set(db, KEY_TRACKING_UTM_CAMPAIGN, utm_campaign.strip())
    return get_tracking_settings(db)

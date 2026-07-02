from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_user
from app.database import get_db
from app.settings_store import get_bot_token, get_channel_id, mask_token, save_telegram_settings
from app.stats_publish_log import monthly_published_stats, purge_old_publish_logs
from app.stats_backfill import backfill_publish_logs, backfill_published_posts
from app.telegram_runtime import refresh_telegram_state
from app.tracking import save_tracking_settings, tracking_settings_to_dict

router = APIRouter(prefix="/api/settings", tags=["settings"])


class TelegramSettingsResponse(BaseModel):
    channel_id: str
    token_configured: bool
    token_hint: str
    bot_username: str | None = None
    channel_display: str | None = None
    bot_connected: bool = False


class TelegramSettingsUpdate(BaseModel):
    bot_token: str | None = Field(default=None, description="Пусто — не менять")
    channel_id: str = Field(..., min_length=1)


class TrackingSettingsResponse(BaseModel):
    enabled: bool
    utm_source: str
    utm_medium: str
    utm_campaign: str


class TrackingSettingsUpdate(BaseModel):
    enabled: bool | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None


class MonthlyStatsResponse(BaseModel):
    retention_months: int
    months: list[dict]
    total: int


@router.get("/telegram", response_model=TelegramSettingsResponse)
async def get_telegram_settings(request: Request, _: str = Depends(require_user)):
    token = get_bot_token()
    channel = get_channel_id()
    return TelegramSettingsResponse(
        channel_id=channel,
        token_configured=bool(token),
        token_hint=mask_token(token),
        bot_username=getattr(request.app.state, "bot_username", None),
        channel_display=getattr(request.app.state, "channel_display", channel),
        bot_connected=bool(getattr(request.app.state, "bot_connected", False)),
    )


@router.put("/telegram", response_model=TelegramSettingsResponse)
async def update_telegram_settings(
    payload: TelegramSettingsUpdate,
    request: Request,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    try:
        save_telegram_settings(
            db,
            bot_token=payload.bot_token,
            channel_id=payload.channel_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await refresh_telegram_state(request.app)
    return await get_telegram_settings(request)


@router.post("/telegram/verify", response_model=TelegramSettingsResponse)
async def verify_telegram_settings(
    request: Request,
    _: str = Depends(require_user),
):
    await refresh_telegram_state(request.app)
    if not getattr(request.app.state, "bot_connected", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось подключиться к боту. Проверьте токен.",
        )
    return await get_telegram_settings(request)


@router.get("/stats", response_model=MonthlyStatsResponse)
async def get_publish_stats(db: Session = Depends(get_db), _: str = Depends(require_user)):
    backfill_publish_logs(db)
    purge_old_publish_logs(db)
    return monthly_published_stats(db)


@router.post("/stats/backfill")
async def run_stats_backfill(db: Session = Depends(get_db), _: str = Depends(require_user)):
    return await backfill_published_posts(db)


@router.get("/tracking", response_model=TrackingSettingsResponse)
async def get_tracking_settings_route(db: Session = Depends(get_db), _: str = Depends(require_user)):
    return tracking_settings_to_dict(db)


@router.put("/tracking", response_model=TrackingSettingsResponse)
async def update_tracking_settings(
    payload: TrackingSettingsUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    return save_tracking_settings(
        db,
        enabled=payload.enabled,
        utm_source=payload.utm_source,
        utm_medium=payload.utm_medium,
        utm_campaign=payload.utm_campaign,
    )

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_user
from app.buttons import (
    ButtonValidationError,
    buttons_for_post,
    replace_post_buttons,
)
from app.config import settings
from app.database import Post, PostStatus, get_db
from app.formatter import preview_html
from app.markdown_telegram import prepare_markdown_for_telegram
from app.post_retention import purge_expired_posts
from app.post_utils import (
    DEFAULT_POST_TITLE,
    display_post_title,
    maybe_fix_generic_title,
    title_from_content,
)
from app.publish import finalize_published_post, publish_post_to_telegram
from app.scheduler import cancel_scheduled_post, publish_post_by_id, schedule_post
from app.stats_backfill import ensure_post_stats_ready
from app.telegram_client import TelegramError
from app.telegram_stats import channel_stats_to_dict
from app.tracking import links_for_post, tracking_settings_to_dict

router = APIRouter(prefix="/api/posts", tags=["posts"])


class PostCreate(BaseModel):
    title: str = ""
    content: str = ""
    buttons: list[dict] = Field(default_factory=list)


class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    buttons: list[dict] | None = None


class ScheduleRequest(BaseModel):
    scheduled_at: datetime = Field(..., description="UTC datetime ISO format")


class PreviewRequest(BaseModel):
    content: str


def _utc_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.isoformat() + "Z"


def post_to_dict(post: Post, db: Session) -> dict:
    return {
        "id": post.id,
        "title": post.title,
        "display_title": display_post_title(post.title, post.content),
        "content": post.content,
        "status": post.status,
        "scheduled_at": _utc_iso(post.scheduled_at),
        "published_at": _utc_iso(post.published_at),
        "telegram_message_id": post.telegram_message_id,
        "error_message": post.error_message,
        "created_at": _utc_iso(post.created_at),
        "updated_at": _utc_iso(post.updated_at),
        "buttons": buttons_for_post(db, post.id),
    }


def post_list_item_to_dict(post: Post) -> dict:
    return {
        "id": post.id,
        "title": post.title,
        "display_title": display_post_title(post.title, post.content),
        "status": post.status,
        "scheduled_at": _utc_iso(post.scheduled_at),
        "published_at": _utc_iso(post.published_at),
        "updated_at": _utc_iso(post.updated_at),
    }


def _apply_post_filter(query, status_filter: str | None):
    if status_filter == "published":
        return query.filter(Post.status == PostStatus.PUBLISHED.value)
    if status_filter == "draft":
        return query.filter(Post.status != PostStatus.PUBLISHED.value)
    return query


def _sync_generic_titles(posts: list[Post], db: Session) -> None:
    changed = False
    for post in posts:
        derived = maybe_fix_generic_title(post.title, post.content)
        if derived and post.title != derived:
            post.title = derived
            changed = True
    if changed:
        db.commit()


@router.get("")
async def list_posts(
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
    status_filter: str | None = Query(default=None, alias="filter", pattern="^(draft|published)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=50),
):
    purge_expired_posts(db)

    base_query = db.query(Post)
    filtered_query = _apply_post_filter(base_query, status_filter)
    total = filtered_query.count()

    posts = (
        filtered_query.order_by(Post.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    _sync_generic_titles(posts, db)

    loaded = len(posts)
    return {
        "posts": [post_list_item_to_dict(p) for p in posts],
        "retention_days": settings.post_retention_days,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + loaded < total,
        "filter": status_filter,
    }


@router.post("")
async def create_post(payload: PostCreate, db: Session = Depends(get_db), _: str = Depends(require_user)):
    try:
        post = Post(title=payload.title, content=payload.content, status=PostStatus.DRAFT.value)
        db.add(post)
        db.commit()
        db.refresh(post)
        replace_post_buttons(db, post.id, payload.buttons)
        db.commit()
        db.refresh(post)
        return post_to_dict(post, db)
    except ButtonValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{post_id}")
async def get_post(post_id: int, db: Session = Depends(get_db), _: str = Depends(require_user)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    derived = maybe_fix_generic_title(post.title, post.content)
    if derived and post.title != derived:
        post.title = derived
        db.commit()
        db.refresh(post)
    return post_to_dict(post, db)


@router.put("/{post_id}")
async def update_post(
    post_id: int,
    payload: PostUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    if post.status == PostStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Опубликованный пост нельзя редактировать")

    if payload.title is not None:
        post.title = payload.title
    if payload.content is not None:
        post.content = payload.content

    try:
        if payload.buttons is not None:
            replace_post_buttons(db, post.id, payload.buttons)
        post.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(post)
        return post_to_dict(post, db)
    except ButtonValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{post_id}")
async def delete_post(post_id: int, db: Session = Depends(get_db), _: str = Depends(require_user)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    if post.status == PostStatus.SCHEDULED.value:
        cancel_scheduled_post(post_id)

    db.delete(post)
    db.commit()
    return {"ok": True}


@router.post("/preview")
async def preview(payload: PreviewRequest, _: str = Depends(require_user)):
    return {"html": preview_html(payload.content)}


@router.post("/export/telegram-markdown")
async def export_telegram_markdown(payload: PreviewRequest, _: str = Depends(require_user)):
    return {"markdown": prepare_markdown_for_telegram(payload.content)}


@router.post("/{post_id}/publish")
async def publish_now(post_id: int, db: Session = Depends(get_db), _: str = Depends(require_user)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    if post.status == PostStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Пост уже опубликован")
    if not post.content.strip():
        raise HTTPException(status_code=400, detail="Пост пустой")

    if post.status == PostStatus.SCHEDULED.value:
        cancel_scheduled_post(post_id)

    try:
        message_id = await publish_post_to_telegram(post, db)
        if not post.title or post.title.strip() == DEFAULT_POST_TITLE:
            derived = title_from_content(post.content)
            if derived:
                post.title = derived
        post.status = PostStatus.PUBLISHED.value
        post.published_at = datetime.utcnow()
        post.telegram_message_id = message_id
        post.scheduled_at = None
        post.error_message = None
        await finalize_published_post(db, post)
        db.commit()
        db.refresh(post)
        return post_to_dict(post, db)
    except TelegramError as exc:
        post.status = PostStatus.FAILED.value
        post.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{post_id}/schedule")
async def schedule(
    post_id: int,
    payload: ScheduleRequest,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    if post.status == PostStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Пост уже опубликован")
    if not post.content.strip():
        raise HTTPException(status_code=400, detail="Пост пустой")

    scheduled_at = payload.scheduled_at.replace(tzinfo=None) if payload.scheduled_at.tzinfo else payload.scheduled_at

    post.status = PostStatus.SCHEDULED.value
    post.scheduled_at = scheduled_at
    post.error_message = None
    post.updated_at = datetime.utcnow()
    db.commit()

    schedule_post(post_id, scheduled_at)
    db.refresh(post)
    return post_to_dict(post, db)


@router.get("/{post_id}/stats")
async def get_post_stats(post_id: int, db: Session = Depends(get_db), _: str = Depends(require_user)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    if post.status != PostStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Статистика доступна только для опубликованных постов")

    await ensure_post_stats_ready(db, post)

    return {
        "post_id": post.id,
        "title": post.title,
        "published_at": _utc_iso(post.published_at),
        "telegram_message_id": post.telegram_message_id,
        "channel_stats": channel_stats_to_dict(post.channel_stats, post, db),
        "buttons": buttons_for_post(db, post.id),
        "links": links_for_post(db, post.id),
        "tracking": tracking_settings_to_dict(db),
    }

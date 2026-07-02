from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
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
from app.post_retention import purge_expired_posts
from app.post_utils import (
    DEFAULT_POST_TITLE,
    display_post_title,
    maybe_fix_generic_title,
    title_from_content,
)
from app.publish import publish_post_to_telegram
from app.scheduler import cancel_scheduled_post, publish_post_by_id, schedule_post
from app.telegram_client import TelegramError

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
async def list_posts(db: Session = Depends(get_db), _: str = Depends(require_user)):
    purge_expired_posts(db)
    posts = db.query(Post).order_by(Post.updated_at.desc()).all()
    _sync_generic_titles(posts, db)
    return {
        "posts": [post_to_dict(p, db) for p in posts],
        "retention_days": settings.post_retention_days,
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

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_user
from app.database import Post, PostStatus, get_db
from app.formatter import preview_html
from app.scheduler import cancel_scheduled_post, publish_post_by_id, schedule_post
from app.telegram_client import TelegramError, send_message

router = APIRouter(prefix="/api/posts", tags=["posts"])


class PostCreate(BaseModel):
    title: str = ""
    content: str = ""


class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class ScheduleRequest(BaseModel):
    scheduled_at: datetime = Field(..., description="UTC datetime ISO format")


class PreviewRequest(BaseModel):
    content: str


def post_to_dict(post: Post) -> dict:
    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "status": post.status,
        "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "telegram_message_id": post.telegram_message_id,
        "error_message": post.error_message,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "updated_at": post.updated_at.isoformat() if post.updated_at else None,
    }


@router.get("")
async def list_posts(db: Session = Depends(get_db), _: str = Depends(require_user)):
    posts = db.query(Post).order_by(Post.updated_at.desc()).all()
    return [post_to_dict(p) for p in posts]


@router.post("")
async def create_post(payload: PostCreate, db: Session = Depends(get_db), _: str = Depends(require_user)):
    post = Post(title=payload.title, content=payload.content, status=PostStatus.DRAFT.value)
    db.add(post)
    db.commit()
    db.refresh(post)
    return post_to_dict(post)


@router.get("/{post_id}")
async def get_post(post_id: int, db: Session = Depends(get_db), _: str = Depends(require_user)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    return post_to_dict(post)


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
    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(post)
    return post_to_dict(post)


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
        message_id = await send_message(post.content)
        post.status = PostStatus.PUBLISHED.value
        post.published_at = datetime.utcnow()
        post.telegram_message_id = message_id
        post.scheduled_at = None
        post.error_message = None
        db.commit()
        db.refresh(post)
        return post_to_dict(post)
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
    return post_to_dict(post)

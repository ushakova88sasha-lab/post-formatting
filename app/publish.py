from sqlalchemy.orm import Session

from app.buttons import build_inline_keyboard
from app.database import Post, PostButton
from app.stats_publish_log import log_published_post
from app.telegram_client import send_message
from app.telegram_stats import capture_channel_stats_at_publish
from app.tracking import build_tracked_content


def post_buttons_for_publish(db: Session, post_id: int) -> list[PostButton]:
    return (
        db.query(PostButton)
        .filter(PostButton.post_id == post_id)
        .order_by(PostButton.position.asc())
        .all()
    )


async def publish_post_to_telegram(post: Post, db: Session) -> int:
    buttons = post_buttons_for_publish(db, post.id)
    reply_markup = build_inline_keyboard(buttons)
    tracked_content = build_tracked_content(post.content, db, post.id)
    return await send_message(tracked_content, reply_markup=reply_markup)


async def finalize_published_post(db: Session, post: Post) -> None:
    log_published_post(db, post)
    await capture_channel_stats_at_publish(db, post)

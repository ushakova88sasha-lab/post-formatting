from sqlalchemy.orm import Session

from app.buttons import build_inline_keyboard
from app.database import Post, PostButton
from app.telegram_client import send_message


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
    return await send_message(post.content, reply_markup=reply_markup)

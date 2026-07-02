import re
import secrets
from urllib.parse import urlparse

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import ButtonClick, PostButton

_URL_RE = re.compile(r"^https?://", re.IGNORECASE)
_MAX_BUTTONS = 10


class ButtonValidationError(ValueError):
    pass


def _new_click_token() -> str:
    return secrets.token_urlsafe(9)


def validate_button_payload(text: str, url: str) -> None:
    label = (text or "").strip()
    target = (url or "").strip()
    if not label:
        raise ButtonValidationError("Текст кнопки не может быть пустым")
    if len(label) > 64:
        raise ButtonValidationError("Текст кнопки — не более 64 символов")
    if not target:
        raise ButtonValidationError("Укажите URL кнопки")
    if not _URL_RE.match(target):
        raise ButtonValidationError("URL должен начинаться с http:// или https://")
    parsed = urlparse(target)
    if not parsed.netloc:
        raise ButtonValidationError("Некорректный URL кнопки")


def normalize_buttons_payload(buttons: list[dict] | None) -> list[dict]:
    if not buttons:
        return []
    if len(buttons) > _MAX_BUTTONS:
        raise ButtonValidationError(f"Не более {_MAX_BUTTONS} кнопок в одном посте")

    normalized: list[dict] = []
    for index, item in enumerate(buttons):
        text = str(item.get("text", "")).strip()
        url = str(item.get("url", "")).strip()
        validate_button_payload(text, url)
        normalized.append({"text": text, "url": url, "position": index})
    return normalized


def replace_post_buttons(db: Session, post_id: int, buttons: list[dict] | None) -> list[PostButton]:
    normalized = normalize_buttons_payload(buttons)
    existing = (
        db.query(PostButton)
        .filter(PostButton.post_id == post_id)
        .order_by(PostButton.position.asc())
        .all()
    )

    for button in existing:
        db.delete(button)
    db.flush()

    created: list[PostButton] = []
    for item in normalized:
        button = PostButton(
            post_id=post_id,
            text=item["text"],
            url=item["url"],
            position=item["position"],
            click_token=_new_click_token(),
        )
        db.add(button)
        created.append(button)

    db.flush()
    return created


def click_count_map(db: Session, button_ids: list[int]) -> dict[int, int]:
    if not button_ids:
        return {}
    rows = (
        db.query(ButtonClick.button_id, func.count(ButtonClick.id))
        .filter(ButtonClick.button_id.in_(button_ids))
        .group_by(ButtonClick.button_id)
        .all()
    )
    return {button_id: count for button_id, count in rows}


def button_to_dict(button: PostButton, click_count: int = 0) -> dict:
    return {
        "id": button.id,
        "text": button.text,
        "url": button.url,
        "position": button.position,
        "click_count": click_count,
        "track_url": tracked_url(button.click_token),
    }


def buttons_for_post(db: Session, post_id: int) -> list[dict]:
    buttons = (
        db.query(PostButton)
        .filter(PostButton.post_id == post_id)
        .order_by(PostButton.position.asc())
        .all()
    )
    counts = click_count_map(db, [button.id for button in buttons])
    return [button_to_dict(button, counts.get(button.id, 0)) for button in buttons]


def tracked_url(click_token: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/go/{click_token}"


def build_inline_keyboard(buttons: list[PostButton]) -> dict:
    keyboard = [[{"text": button.text, "url": tracked_url(button.click_token)}] for button in buttons]
    return {"inline_keyboard": keyboard}


def record_click(db: Session, click_token: str, user_agent: str | None = None) -> str:
    button = db.query(PostButton).filter(PostButton.click_token == click_token).first()
    if not button:
        raise LookupError("Кнопка не найдена")

    db.add(ButtonClick(button_id=button.id, user_agent=user_agent))
    db.commit()
    return button.url

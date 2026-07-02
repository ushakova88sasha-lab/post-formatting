import hashlib
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


def validate_button_text(text: str) -> None:
    label = (text or "").strip()
    if not label:
        raise ButtonValidationError("Текст кнопки не может быть пустым")
    if len(label) > 64:
        raise ButtonValidationError("Текст кнопки — не более 64 символов")


def validate_button_url(url: str) -> None:
    target = (url or "").strip()
    if not target:
        raise ButtonValidationError("Укажите URL кнопки")
    if not _URL_RE.match(target):
        raise ButtonValidationError("URL должен начинаться с http:// или https://")
    parsed = urlparse(target)
    if not parsed.netloc:
        raise ButtonValidationError("Некорректный URL кнопки")


def validate_button_payload(text: str, url: str) -> None:
    validate_button_text(text)
    validate_button_url(url)


def normalize_buttons_payload(buttons: list[dict] | None) -> list[dict]:
    if not buttons:
        return []
    if len(buttons) > _MAX_BUTTONS:
        raise ButtonValidationError(f"Не более {_MAX_BUTTONS} кнопок в одном посте")

    normalized: list[dict] = []
    for index, item in enumerate(buttons):
        text = str(item.get("text", "")).strip()
        url = str(item.get("url", "")).strip()
        if not text and not url:
            continue
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
        db.query(ButtonClick.button_id, func.count(func.distinct(ButtonClick.visitor_hash)))
        .filter(ButtonClick.button_id.in_(button_ids), ButtonClick.visitor_hash != "")
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


def build_inline_keyboard(buttons: list[PostButton]) -> dict | None:
    keyboard_buttons = [button for button in buttons if button.text.strip() and button.url.strip()]
    if not keyboard_buttons:
        return None
    keyboard = [
        [{"text": button.text, "url": tracked_url(button.click_token)}] for button in keyboard_buttons
    ]
    return {"inline_keyboard": keyboard}


def visitor_hash_from_request(client_host: str | None, user_agent: str | None, forwarded_for: str | None) -> str:
    ip = (forwarded_for or client_host or "unknown").split(",")[0].strip()
    ua = (user_agent or "").strip()
    digest = hashlib.sha256(f"{ip}|{ua}".encode("utf-8")).hexdigest()
    return digest[:32]


def record_click(
    db: Session,
    click_token: str,
    *,
    visitor_hash: str,
    user_agent: str | None = None,
) -> str:
    button = db.query(PostButton).filter(PostButton.click_token == click_token).first()
    if not button:
        raise LookupError("Кнопка не найдена")

    exists = (
        db.query(ButtonClick.id)
        .filter(ButtonClick.button_id == button.id, ButtonClick.visitor_hash == visitor_hash)
        .first()
    )
    if not exists:
        db.add(
            ButtonClick(
                button_id=button.id,
                user_agent=user_agent,
                visitor_hash=visitor_hash,
            )
        )
        db.commit()
    return button.url

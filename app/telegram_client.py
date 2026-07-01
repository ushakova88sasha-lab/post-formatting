import httpx

from app.config import settings
from app.image_host import resolve_media_for_telegram
from app.markdown_telegram import prepare_markdown_for_telegram


class TelegramError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


async def send_message(text: str) -> int:
    """Отправляет пост в канал через Rich Messages API. Возвращает message_id."""
    markdown = text.strip()
    if not markdown:
        raise TelegramError("Пост пустой")

    try:
        markdown = await resolve_media_for_telegram(markdown)
    except Exception as exc:
        raise TelegramError(f"Ошибка подготовки медиа: {exc}") from exc

    markdown = prepare_markdown_for_telegram(markdown)

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendRichMessage"
    payload = {
        "chat_id": settings.telegram_channel_id,
        "rich_message": {
            "markdown": markdown,
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        data = response.json()

    if not data.get("ok"):
        description = data.get("description", "Неизвестная ошибка Telegram API")
        raise TelegramError(description, response.status_code)

    return data["result"]["message_id"]


async def verify_bot() -> dict:
    """Проверяет токен бота при старте."""
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/getMe"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url)
        data = response.json()

    if not data.get("ok"):
        raise TelegramError(data.get("description", "Неверный токен бота"))

    return data["result"]

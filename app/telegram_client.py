import httpx

from app.config import settings
from app.formatter import markdown_to_telegram_html


class TelegramError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


async def send_message(text: str) -> int:
    """Отправляет пост в канал. Возвращает message_id."""
    html_text = markdown_to_telegram_html(text)
    if not html_text:
        raise TelegramError("Пост пустой")

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    payload = {
        "chat_id": settings.telegram_channel_id,
        "text": html_text,
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
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

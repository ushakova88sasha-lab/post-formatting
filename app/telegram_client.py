import httpx

from app.image_host import resolve_media_for_telegram
from app.markdown_telegram import prepare_markdown_for_telegram
from app.settings_store import get_bot_token, get_channel_id


class TelegramError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _require_telegram_config() -> tuple[str, str]:
    token = get_bot_token()
    channel = get_channel_id()
    if not token:
        raise TelegramError("Укажите токен бота в Настройках")
    if not channel:
        raise TelegramError("Укажите канал в Настройках")
    return token, channel


async def send_message(text: str, reply_markup: dict | None = None) -> int:
    """Отправляет пост в канал через Rich Messages API. Возвращает message_id."""
    markdown = text.strip()
    if not markdown:
        raise TelegramError("Пост пустой")

    token, channel = _require_telegram_config()

    try:
        markdown = await resolve_media_for_telegram(markdown)
    except Exception as exc:
        raise TelegramError(f"Ошибка подготовки медиа: {exc}") from exc

    markdown = prepare_markdown_for_telegram(markdown)

    url = f"https://api.telegram.org/bot{token}/sendRichMessage"
    payload: dict = {
        "chat_id": channel,
        "rich_message": {
            "markdown": markdown,
        },
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        data = response.json()

    if not data.get("ok"):
        description = data.get("description", "Неизвестная ошибка Telegram API")
        raise TelegramError(description, response.status_code)

    return data["result"]["message_id"]


async def get_sticker_set(name: str) -> dict:
    """Загружает набор стикеров/эмодзи по short name (например MPSTATS_posts)."""
    token = get_bot_token()
    if not token:
        raise TelegramError("Укажите токен бота в Настройках")

    url = f"https://api.telegram.org/bot{token}/getStickerSet"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, params={"name": name})
        data = response.json()

    if not data.get("ok"):
        description = data.get("description", "Не удалось загрузить набор эмодзи")
        raise TelegramError(description, response.status_code)

    return data["result"]


async def get_telegram_file_path(file_id: str) -> str:
    token = get_bot_token()
    if not token:
        raise TelegramError("Укажите токен бота в Настройках")

    url = f"https://api.telegram.org/bot{token}/getFile"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, params={"file_id": file_id})
        data = response.json()

    if not data.get("ok"):
        description = data.get("description", "Не удалось получить файл превью")
        raise TelegramError(description, response.status_code)

    file_path = data.get("result", {}).get("file_path")
    if not file_path:
        raise TelegramError("Telegram не вернул путь к файлу превью")

    return file_path


async def download_telegram_file(file_path: str) -> bytes:
    token = get_bot_token()
    if not token:
        raise TelegramError("Укажите токен бота в Настройках")

    url = f"https://api.telegram.org/file/bot{token}/{file_path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


async def verify_bot() -> dict:
    """Проверяет токен бота."""
    token = get_bot_token()
    if not token:
        raise TelegramError("Токен бота не указан")

    url = f"https://api.telegram.org/bot{token}/getMe"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url)
        data = response.json()

    if not data.get("ok"):
        raise TelegramError(data.get("description", "Неверный токен бота"))

    return data["result"]

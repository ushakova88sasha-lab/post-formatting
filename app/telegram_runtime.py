import httpx
from fastapi import FastAPI

from app.settings_store import get_bot_token, get_channel_id


async def resolve_channel_display() -> str:
    channel_id = get_channel_id().strip()
    if not channel_id:
        return "не указан"
    if channel_id.startswith("@"):
        return channel_id

    token = get_bot_token()
    if not token:
        return channel_id

    try:
        url = f"https://api.telegram.org/bot{token}/getChat"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, params={"chat_id": channel_id})
            data = response.json()
        if data.get("ok"):
            chat = data["result"]
            if chat.get("username"):
                return f"@{chat['username']}"
            if chat.get("title"):
                return chat["title"]
    except Exception:
        pass

    return channel_id


async def refresh_telegram_state(app: FastAPI) -> None:
    from app.telegram_client import verify_bot

    try:
        bot = await verify_bot()
        app.state.bot_username = bot.get("username", "unknown")
        app.state.bot_connected = True
    except Exception:
        app.state.bot_username = None
        app.state.bot_connected = False

    try:
        app.state.channel_display = await resolve_channel_display()
    except Exception:
        app.state.channel_display = get_channel_id() or "не указан"

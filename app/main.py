from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import auth, posts, uploads
from app.scheduler import start_scheduler, stop_scheduler
from app.telegram_client import verify_bot

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _resolve_channel_display() -> str:
    channel_id = settings.telegram_channel_id.strip()
    if channel_id.startswith("@"):
        return channel_id

    try:
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/getChat"
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    try:
        bot = await verify_bot()
        app.state.bot_username = bot.get("username", "unknown")
    except Exception:
        app.state.bot_username = None
    try:
        app.state.channel_display = await _resolve_channel_display()
    except Exception:
        app.state.channel_display = settings.telegram_channel_id
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Telegram Post Admin",
    description="Админ-панель для оформления и публикации постов в Telegram",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(uploads.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/login")
async def login_page():
    return FileResponse(STATIC_DIR / "login.html")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "bot_connected": app.state.bot_username is not None,
        "bot_username": app.state.bot_username,
        "channel": getattr(app.state, "channel_display", settings.telegram_channel_id),
    }

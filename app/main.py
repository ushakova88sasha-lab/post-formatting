from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.post_retention import purge_expired_posts_session
from app.routers import auth, clicks, posts, settings as settings_router, uploads
from app.scheduler import start_scheduler, stop_scheduler
from app.settings_store import get_channel_id
from app.telegram_runtime import refresh_telegram_state

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    purge_expired_posts_session()
    await refresh_telegram_state(app)
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
app.include_router(clicks.router)
app.include_router(uploads.router)
app.include_router(settings_router.router)
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
        "bot_connected": getattr(app.state, "bot_connected", False),
        "bot_username": getattr(app.state, "bot_username", None),
        "channel": getattr(app.state, "channel_display", get_channel_id() or "не указан"),
    }

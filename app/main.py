from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.routers import auth, posts
from app.scheduler import start_scheduler, stop_scheduler
from app.telegram_client import verify_bot

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        bot = await verify_bot()
        app.state.bot_username = bot.get("username", "unknown")
    except Exception:
        app.state.bot_username = None
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
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


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
    }

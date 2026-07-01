from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    telegram_bot_token: str
    telegram_channel_id: str
    admin_username: str
    admin_password: str
    session_secret: str
    host: str = "0.0.0.0"
    port: int = 8000
    database_url: str = "sqlite:///./data/posts.db"
    # Публичный URL сервера — нужен Telegram для загрузки картинок по HTTP
    public_base_url: str = "http://localhost:8000"


settings = Settings()

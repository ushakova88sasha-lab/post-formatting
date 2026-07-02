from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


class PostStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default=PostStatus.DRAFT.value)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    telegram_message_id: Mapped[int | None] = mapped_column(nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    buttons: Mapped[list["PostButton"]] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="PostButton.position",
    )


class PostButton(Base):
    __tablename__ = "post_buttons"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(64), default="")
    url: Mapped[str] = mapped_column(String(2048), default="")
    position: Mapped[int] = mapped_column(default=0)
    click_token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    post: Mapped["Post"] = relationship(back_populates="buttons")
    clicks: Mapped[list["ButtonClick"]] = relationship(
        back_populates="button",
        cascade="all, delete-orphan",
    )


class ButtonClick(Base):
    __tablename__ = "button_clicks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    button_id: Mapped[int] = mapped_column(
        ForeignKey("post_buttons.id", ondelete="CASCADE"), index=True
    )
    clicked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    button: Mapped["PostButton"] = relationship(back_populates="clicks")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    import os

    os.makedirs("data", exist_ok=True)
    Base.metadata.create_all(bind=engine)

    from app.settings_store import seed_from_env

    seed_from_env()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

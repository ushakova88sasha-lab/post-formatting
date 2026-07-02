from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, create_engine, inspect, text
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
    links: Mapped[list["PostLink"]] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="PostLink.position",
    )
    channel_stats: Mapped["PostChannelStats | None"] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
        uselist=False,
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
    __table_args__ = (UniqueConstraint("button_id", "visitor_hash", name="uq_button_visitor"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    button_id: Mapped[int] = mapped_column(
        ForeignKey("post_buttons.id", ondelete="CASCADE"), index=True
    )
    clicked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    visitor_hash: Mapped[str] = mapped_column(String(64), default="")
    button: Mapped["PostButton"] = relationship(back_populates="clicks")


class PostLink(Base):
    __tablename__ = "post_links"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(2048), default="")
    label: Mapped[str] = mapped_column(String(255), default="")
    position: Mapped[int] = mapped_column(default=0)
    click_token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    post: Mapped["Post"] = relationship(back_populates="links")
    clicks: Mapped[list["LinkClick"]] = relationship(
        back_populates="link",
        cascade="all, delete-orphan",
    )


class LinkClick(Base):
    __tablename__ = "link_clicks"
    __table_args__ = (UniqueConstraint("link_id", "visitor_hash", name="uq_link_visitor"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("post_links.id", ondelete="CASCADE"), index=True)
    clicked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    visitor_hash: Mapped[str] = mapped_column(String(64), default="")
    link: Mapped["PostLink"] = relationship(back_populates="clicks")


class PostChannelStats(Base):
    __tablename__ = "post_channel_stats"

    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True)
    views: Mapped[int | None] = mapped_column(nullable=True)
    forwards: Mapped[int | None] = mapped_column(nullable=True)
    reactions_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    post: Mapped["Post"] = relationship(back_populates="channel_stats")


class PublishedPostLog(Base):
    __tablename__ = "published_post_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int | None] = mapped_column(nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    published_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    telegram_message_id: Mapped[int | None] = mapped_column(nullable=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _migrate_schema() -> None:
    inspector = inspect(engine)
    if "button_clicks" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("button_clicks")}
    if "visitor_hash" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE button_clicks ADD COLUMN visitor_hash VARCHAR(64) DEFAULT ''"))
            conn.execute(
                text(
                    "UPDATE button_clicks SET visitor_hash = 'legacy:' || id "
                    "WHERE visitor_hash IS NULL OR visitor_hash = ''"
                )
            )


def init_db() -> None:
    import os

    os.makedirs("data", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _migrate_schema()

    from app.settings_store import seed_from_env

    seed_from_env()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

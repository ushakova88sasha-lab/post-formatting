from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.database import Post, PostStatus, SessionLocal
from app.telegram_client import TelegramError, send_message

scheduler = AsyncIOScheduler()


async def publish_post_by_id(post_id: int) -> None:
    db = SessionLocal()
    try:
        post = db.get(Post, post_id)
        if not post:
            return
        if post.status == PostStatus.PUBLISHED.value:
            return

        try:
            message_id = await send_message(post.content)
            post.status = PostStatus.PUBLISHED.value
            post.published_at = datetime.utcnow()
            post.telegram_message_id = message_id
            post.error_message = None
        except TelegramError as exc:
            post.status = PostStatus.FAILED.value
            post.error_message = str(exc)
        except Exception as exc:
            post.status = PostStatus.FAILED.value
            post.error_message = str(exc)

        db.commit()
    finally:
        db.close()


def schedule_post(post_id: int, run_at: datetime) -> None:
    job_id = f"post_{post_id}"
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)

    if run_at <= datetime.utcnow():
        scheduler.add_job(publish_post_by_id, args=[post_id], id=job_id)
    else:
        scheduler.add_job(
            publish_post_by_id,
            trigger=DateTrigger(run_date=run_at),
            args=[post_id],
            id=job_id,
        )


def cancel_scheduled_post(post_id: int) -> None:
    job_id = f"post_{post_id}"
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)


def restore_scheduled_jobs() -> None:
    db = SessionLocal()
    try:
        posts = (
            db.query(Post)
            .filter(Post.status == PostStatus.SCHEDULED.value, Post.scheduled_at.isnot(None))
            .all()
        )
        now = datetime.utcnow()
        for post in posts:
            if post.scheduled_at and post.scheduled_at > now:
                schedule_post(post.id, post.scheduled_at)
            elif post.scheduled_at:
                schedule_post(post.id, now)
    finally:
        db.close()


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()
        restore_scheduled_jobs()
        from app.post_retention import purge_expired_posts_session

        scheduler.add_job(
            purge_expired_posts_session,
            trigger=IntervalTrigger(hours=6),
            id="purge_expired_posts",
            replace_existing=True,
        )


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)

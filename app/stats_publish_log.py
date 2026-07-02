from calendar import monthrange
from datetime import datetime

from dateutil.relativedelta import relativedelta
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import PublishedPostLog, Post


def log_published_post(db: Session, post: Post) -> PublishedPostLog:
    entry = PublishedPostLog(
        post_id=post.id,
        title=post.title or "",
        published_at=post.published_at or datetime.utcnow(),
        telegram_message_id=post.telegram_message_id,
    )
    db.add(entry)
    db.flush()
    return entry


def stats_retention_cutoff() -> datetime:
    return datetime.utcnow() - relativedelta(months=settings.stats_retention_months)


def purge_old_publish_logs(db: Session) -> int:
    cutoff = stats_retention_cutoff()
    deleted = (
        db.query(PublishedPostLog)
        .filter(PublishedPostLog.published_at < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return deleted


def _month_label(year: int, month: int) -> str:
    names = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
    ]
    return f"{names[month - 1]} {year}"


def monthly_published_stats(db: Session, months: int | None = None) -> dict:
    retention = months or settings.stats_retention_months
    now = datetime.utcnow()
    month_keys: list[tuple[int, int]] = []
    cursor = datetime(now.year, now.month, 1)
    for _ in range(retention):
        month_keys.append((cursor.year, cursor.month))
        cursor = cursor - relativedelta(months=1)

    counts: dict[tuple[int, int], int] = {key: 0 for key in month_keys}
    cutoff = stats_retention_cutoff()
    rows = (
        db.query(
            func.strftime("%Y", PublishedPostLog.published_at).label("year"),
            func.strftime("%m", PublishedPostLog.published_at).label("month"),
            func.count(PublishedPostLog.id),
        )
        .filter(PublishedPostLog.published_at >= cutoff)
        .group_by("year", "month")
        .all()
    )
    for year_str, month_str, count in rows:
        key = (int(year_str), int(month_str))
        if key in counts:
            counts[key] = count

    result_months = []
    total = 0
    for year, month in reversed(month_keys):
        count = counts[(year, month)]
        total += count
        result_months.append(
            {
                "month": f"{year:04d}-{month:02d}",
                "label": _month_label(year, month),
                "count": count,
                "days_in_month": monthrange(year, month)[1],
            }
        )

    return {
        "retention_months": retention,
        "months": result_months,
        "total": total,
    }

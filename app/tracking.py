import re
import secrets
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.buttons import tracked_url
from app.config import settings
from app.database import LinkClick, PostLink
from app.settings_store import get_tracking_settings

_MARKDOWN_LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
_ANGLE_LINK_RE = re.compile(r"<(https?://[^>]+)>")
_BARE_URL_RE = re.compile(r"(?<![(\[<])(https?://[^\s<>)\]]+)")
_SKIP_URL_PREFIXES = ("/go/", "/uploads/", "/static/")
_IMAGE_EXT_RE = re.compile(r"\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|ogg|wav)(\?|$)", re.I)


def _new_click_token() -> str:
    return secrets.token_urlsafe(9)


def _should_track_url(url: str) -> bool:
    target = (url or "").strip()
    if not target:
        return False
    if not target.startswith(("http://", "https://")):
        return False
    parsed = urlparse(target)
    if not parsed.netloc:
        return False
    base = settings.public_base_url.rstrip("/")
    if target.startswith(base + "/go/"):
        return False
    if any(target.startswith(base + prefix) for prefix in _SKIP_URL_PREFIXES if prefix != "/go/"):
        return False
    if _IMAGE_EXT_RE.search(parsed.path):
        return False
    return True


def extract_urls_from_markdown(content: str) -> list[dict]:
    if not content:
        return []

    found: list[dict] = []
    seen: set[str] = set()

    def add(url: str, label: str = "") -> None:
        normalized = url.strip()
        if not _should_track_url(normalized) or normalized in seen:
            return
        seen.add(normalized)
        found.append({"url": normalized, "label": label.strip()})

    for match in _MARKDOWN_LINK_RE.finditer(content):
        add(match.group(2), match.group(1))

    for match in _ANGLE_LINK_RE.finditer(content):
        add(match.group(1))

    for match in _BARE_URL_RE.finditer(content):
        add(match.group(1))

    return found


def sync_post_links_from_content(db: Session, post_id: int, content: str) -> list[PostLink]:
    extracted = extract_urls_from_markdown(content)
    existing = (
        db.query(PostLink)
        .filter(PostLink.post_id == post_id)
        .order_by(PostLink.position.asc())
        .all()
    )
    by_url = {link.url: link for link in existing}

    keep_ids: set[int] = set()
    synced: list[PostLink] = []

    for index, item in enumerate(extracted):
        url = item["url"]
        link = by_url.get(url)
        if link:
            link.position = index
            link.label = item["label"]
            keep_ids.add(link.id)
            synced.append(link)
            continue

        link = PostLink(
            post_id=post_id,
            url=url,
            label=item["label"],
            position=index,
            click_token=_new_click_token(),
        )
        db.add(link)
        synced.append(link)

    for link in existing:
        if link.id and link.id not in keep_ids:
            db.delete(link)

    db.flush()
    return synced


def link_click_count_map(db: Session, link_ids: list[int]) -> dict[int, int]:
    if not link_ids:
        return {}
    rows = (
        db.query(LinkClick.link_id, func.count(func.distinct(LinkClick.visitor_hash)))
        .filter(LinkClick.link_id.in_(link_ids), LinkClick.visitor_hash != "")
        .group_by(LinkClick.link_id)
        .all()
    )
    return {link_id: count for link_id, count in rows}


def link_to_dict(link: PostLink, click_count: int = 0) -> dict:
    return {
        "id": link.id,
        "url": link.url,
        "label": link.label,
        "position": link.position,
        "click_count": click_count,
        "track_url": tracked_url(link.click_token),
    }


def links_for_post(db: Session, post_id: int) -> list[dict]:
    links = (
        db.query(PostLink)
        .filter(PostLink.post_id == post_id)
        .order_by(PostLink.position.asc())
        .all()
    )
    counts = link_click_count_map(db, [link.id for link in links])
    return [link_to_dict(link, counts.get(link.id, 0)) for link in links]


def apply_tracking_params(url: str, *, post_id: int, db: Session) -> str:
    tracking = get_tracking_settings(db)
    if not tracking["enabled"]:
        return url

    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))

    if tracking["utm_source"]:
        query["utm_source"] = tracking["utm_source"]
    if tracking["utm_medium"]:
        query["utm_medium"] = tracking["utm_medium"]

    campaign = tracking["utm_campaign"] or ""
    if campaign:
        campaign = campaign.replace("{post_id}", str(post_id))
        query["utm_campaign"] = campaign

    new_query = urlencode(query)
    return urlunparse(parsed._replace(query=new_query))


def _replace_markdown_url(content: str, original: str, tracked: str) -> str:
    if original == tracked:
        return content

    result = content
    result = result.replace(f"]({original})", f"]({tracked})")
    result = result.replace(f"<{original}>", f"<{tracked}>")
    if original in result:
        result = result.replace(original, tracked)
    return result


def build_tracked_content(content: str, db: Session, post_id: int) -> str:
    links = sync_post_links_from_content(db, post_id, content)
    tracked = content
    for link in links:
        tracked = _replace_markdown_url(tracked, link.url, tracked_url(link.click_token))
    return tracked


def record_tracked_click(
    db: Session,
    click_token: str,
    *,
    visitor_hash: str,
    user_agent: str | None = None,
) -> str:
    from app.database import PostButton, ButtonClick

    button = db.query(PostButton).filter(PostButton.click_token == click_token).first()
    if button:
        exists = (
            db.query(ButtonClick.id)
            .filter(ButtonClick.button_id == button.id, ButtonClick.visitor_hash == visitor_hash)
            .first()
        )
        if not exists:
            db.add(
                ButtonClick(
                    button_id=button.id,
                    user_agent=user_agent,
                    visitor_hash=visitor_hash,
                )
            )
            db.commit()
        return apply_tracking_params(button.url, post_id=button.post_id, db=db)

    link = db.query(PostLink).filter(PostLink.click_token == click_token).first()
    if not link:
        raise LookupError("Ссылка не найдена")

    exists = (
        db.query(LinkClick.id)
        .filter(LinkClick.link_id == link.id, LinkClick.visitor_hash == visitor_hash)
        .first()
    )
    if not exists:
        db.add(
            LinkClick(
                link_id=link.id,
                user_agent=user_agent,
                visitor_hash=visitor_hash,
            )
        )
        db.commit()
    return apply_tracking_params(link.url, post_id=link.post_id, db=db)


def tracking_settings_to_dict(db: Session) -> dict:
    return get_tracking_settings(db)


def save_tracking_settings(
    db: Session,
    *,
    enabled: bool | None = None,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
) -> dict:
    from app.settings_store import save_tracking_settings as _save

    return _save(
        db,
        enabled=enabled,
        utm_source=utm_source,
        utm_medium=utm_medium,
        utm_campaign=utm_campaign,
    )

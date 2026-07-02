"""Импорт и хранение кастомных (премиум) эмодзи из наборов Telegram."""

from __future__ import annotations

import html
import json
import re
from datetime import UTC, datetime
from typing import Any

PACK_URL_RE = re.compile(
    r"(?:https?://)?(?:t\.me|telegram\.me)/(?:addemoji|addstickers)/(?P<name>[A-Za-z0-9_]+)",
    re.IGNORECASE,
)

CUSTOM_EMOJI_MD_RE = re.compile(
    r"!\[([^\]]*)\]\(tg://emoji\?id=(\d+)\)",
)


class CustomEmojiError(ValueError):
    pass


def parse_pack_url(url: str) -> str:
    text = (url or "").strip()
    if not text:
        raise CustomEmojiError("Укажите ссылку на набор эмодзи")

    match = PACK_URL_RE.search(text)
    if not match:
        raise CustomEmojiError(
            "Неверная ссылка. Пример: https://t.me/addemoji/MPSTATS_posts"
        )
    return match.group("name")


def sticker_set_to_pack(result: dict[str, Any], source_url: str) -> dict[str, Any]:
    stickers = result.get("stickers") or []
    emojis: list[dict[str, Any]] = []

    for sticker in stickers:
        emoji_id = sticker.get("custom_emoji_id")
        if not emoji_id:
            continue

        thumb = sticker.get("thumbnail") or sticker.get("thumb") or {}
        emojis.append(
            {
                "id": str(emoji_id),
                "alt": sticker.get("emoji") or "✨",
                "preview_file_id": thumb.get("file_id") or "",
                "is_animated": bool(sticker.get("is_animated") or sticker.get("is_video")),
            }
        )

    if not emojis:
        raise CustomEmojiError("В наборе нет кастомных эмодзи")

    return {
        "short_name": result.get("name") or "",
        "title": result.get("title") or result.get("name") or "Emoji pack",
        "source_url": source_url.strip(),
        "sticker_type": result.get("sticker_type") or "",
        "imported_at": datetime.now(UTC).isoformat(),
        "emojis": emojis,
    }


def load_packs(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [pack for pack in data if isinstance(pack, dict)]


def dump_packs(packs: list[dict[str, Any]]) -> str:
    return json.dumps(packs, ensure_ascii=False)


def upsert_pack(packs: list[dict[str, Any]], pack: dict[str, Any]) -> list[dict[str, Any]]:
    short_name = pack.get("short_name")
    if not short_name:
        raise CustomEmojiError("У набора нет short_name")

    next_packs = [item for item in packs if item.get("short_name") != short_name]
    next_packs.append(pack)
    next_packs.sort(key=lambda item: (item.get("title") or item.get("short_name") or "").lower())
    return next_packs


def remove_pack(packs: list[dict[str, Any]], short_name: str) -> list[dict[str, Any]]:
    return [pack for pack in packs if pack.get("short_name") != short_name]


def find_emoji_preview_file_id(packs: list[dict[str, Any]], emoji_id: str) -> str | None:
    for pack in packs:
        for emoji in pack.get("emojis") or []:
            if str(emoji.get("id")) == str(emoji_id):
                file_id = emoji.get("preview_file_id")
                return file_id if file_id else None
    return None


def packs_for_client(packs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Убираем внутренние file_id — клиент получает только preview_url."""
    client_packs: list[dict[str, Any]] = []
    for pack in packs:
        emojis = []
        for emoji in pack.get("emojis") or []:
            emoji_id = str(emoji.get("id") or "")
            emojis.append(
                {
                    "id": emoji_id,
                    "alt": emoji.get("alt") or "✨",
                    "preview_url": f"/api/emoji/preview/{emoji_id}" if emoji_id else "",
                    "is_animated": bool(emoji.get("is_animated")),
                }
            )
        client_packs.append(
            {
                "short_name": pack.get("short_name") or "",
                "title": pack.get("title") or "",
                "source_url": pack.get("source_url") or "",
                "emoji_count": len(emojis),
                "emojis": emojis,
            }
        )
    return client_packs


def build_emoji_alt_map(packs: list[dict[str, Any]]) -> dict[str, str]:
    alt_map: dict[str, str] = {}
    for pack in packs:
        for emoji in pack.get("emojis") or []:
            emoji_id = str(emoji.get("id") or "")
            if emoji_id:
                alt_map[emoji_id] = emoji.get("alt") or "✨"
    return alt_map


def custom_emoji_markdown(emoji_id: str, alt: str = "✨") -> str:
    return f"![{alt}](tg://emoji?id={emoji_id})"


def normalize_custom_emoji_markdown(markdown: str, alt_map: dict[str, str]) -> str:
    """Добавляет fallback-эмодзи в markdown, если alt пустой."""

    def repl(match: re.Match[str]) -> str:
        alt = match.group(1).strip() or alt_map.get(match.group(2), "✨")
        return custom_emoji_markdown(match.group(2), alt)

    return CUSTOM_EMOJI_MD_RE.sub(repl, markdown)


def custom_emojis_to_telegram_html(markdown: str, alt_map: dict[str, str]) -> str:
    """Преобразует markdown кастомных эмодзи в <tg-emoji> для sendRichMessage."""

    def repl(match: re.Match[str]) -> str:
        emoji_id = match.group(2)
        alt = match.group(1).strip() or alt_map.get(emoji_id, "✨")
        safe_alt = html.escape(alt, quote=False)
        return f'<tg-emoji emoji-id="{emoji_id}">{safe_alt}</tg-emoji>'

    return CUSTOM_EMOJI_MD_RE.sub(repl, markdown)

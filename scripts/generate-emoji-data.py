#!/usr/bin/env python3
"""Generate static/js/emoji-data.js from iamcal/emoji-data (Unicode emoji set)."""

from __future__ import annotations

import json
import pathlib
import urllib.request

SOURCE_URL = "https://raw.githubusercontent.com/iamcal/emoji-data/master/emoji.json"
OUTPUT = pathlib.Path(__file__).resolve().parents[1] / "static" / "js" / "emoji-data.js"

CATEGORY_META = [
    ("Smileys & Emotion", "smileys", "😀", "Смайлы"),
    ("People & Body", "people", "👋", "Люди"),
    ("Animals & Nature", "animals", "🐶", "Природа"),
    ("Food & Drink", "food", "🍕", "Еда"),
    ("Travel & Places", "travel", "✈️", "Места"),
    ("Activities", "activities", "⚽️", "Спорт"),
    ("Objects", "objects", "💡", "Предметы"),
    ("Symbols", "symbols", "❤️", "Символы"),
    ("Flags", "flags", "🇷🇺", "Флаги"),
]


def unified_to_char(unified: str) -> str:
    return "".join(chr(int(part, 16)) for part in unified.split("-"))


def main() -> None:
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as resp:
        raw = json.load(resp)

    by_category: dict[str, list[dict[str, str]]] = {name: [] for name, _, _, _ in CATEGORY_META}

    for item in raw:
        category = item.get("category")
        if category not in by_category:
            continue

        char = unified_to_char(item["unified"])
        keywords = " ".join(
            [
                item.get("name", ""),
                item.get("short_name", ""),
                *item.get("short_names", []),
            ]
        ).lower()

        by_category[category].append(
            {
                "e": char,
                "q": keywords,
            }
        )

    categories = []
    for source_name, cat_id, label, title in CATEGORY_META:
        emojis = by_category[source_name]
        emojis.sort(key=lambda x: x["e"])
        categories.append(
            {
                "id": cat_id,
                "label": label,
                "title": title,
                "emojis": emojis,
            }
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "window.EMOJI_CATEGORIES = " + json.dumps(categories, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )

    total = sum(len(cat["emojis"]) for cat in categories)
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes, {total} emojis)")


if __name__ == "__main__":
    main()

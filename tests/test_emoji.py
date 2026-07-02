from unittest.mock import AsyncMock

import pytest

from app.custom_emoji import (
    build_emoji_alt_map,
    custom_emojis_to_telegram_html,
    custom_emoji_markdown,
    dump_packs,
    find_emoji_preview_file_id,
    load_packs,
    normalize_custom_emoji_markdown,
    packs_for_client,
    parse_pack_url,
    sticker_set_to_pack,
    upsert_pack,
)


SAMPLE_STICKER_SET = {
    "name": "MPSTATS_posts",
    "title": "MPSTATS",
    "sticker_type": "custom_emoji",
    "stickers": [
        {
            "width": 512,
            "height": 512,
            "emoji": "📊",
            "custom_emoji_id": "5368324170671202286",
            "is_animated": True,
            "is_video": False,
            "thumbnail": {"file_id": "thumb-file-1", "width": 128, "height": 128},
        },
        {
            "width": 512,
            "height": 512,
            "emoji": "🔥",
            "custom_emoji_id": "1234567890123456789",
            "is_animated": False,
            "thumbnail": {"file_id": "thumb-file-2", "width": 128, "height": 128},
        },
    ],
}


def test_parse_pack_url_accepts_addemoji_link():
    assert parse_pack_url("https://t.me/addemoji/MPSTATS_posts") == "MPSTATS_posts"


def test_parse_pack_url_rejects_invalid_link():
    with pytest.raises(ValueError, match="Неверная ссылка"):
        parse_pack_url("https://example.com/pack")


def test_sticker_set_to_pack_maps_custom_emojis():
    pack = sticker_set_to_pack(SAMPLE_STICKER_SET, "https://t.me/addemoji/MPSTATS_posts")

    assert pack["short_name"] == "MPSTATS_posts"
    assert pack["title"] == "MPSTATS"
    assert len(pack["emojis"]) == 2
    assert pack["emojis"][0]["id"] == "5368324170671202286"
    assert pack["emojis"][0]["preview_file_id"] == "thumb-file-1"
    assert pack["emojis"][0]["alt"] == "📊"


def test_packs_for_client_hides_internal_file_ids():
    pack = sticker_set_to_pack(SAMPLE_STICKER_SET, "https://t.me/addemoji/MPSTATS_posts")
    client_pack = packs_for_client([pack])[0]

    assert "preview_file_id" not in client_pack["emojis"][0]
    assert client_pack["emojis"][0]["preview_url"] == "/api/emoji/preview/5368324170671202286"


def test_settings_round_trip_for_custom_emoji_packs():
    pack = sticker_set_to_pack(SAMPLE_STICKER_SET, "https://t.me/addemoji/MPSTATS_posts")
    stored = dump_packs(upsert_pack([], pack))
    loaded = load_packs(stored)

    assert loaded[0]["short_name"] == "MPSTATS_posts"
    assert find_emoji_preview_file_id(loaded, "5368324170671202286") == "thumb-file-1"


def test_emoji_packs_requires_auth(client):
    response = client.get("/api/emoji/packs")
    assert response.status_code == 401


def test_import_emoji_pack(client, auth_cookies, monkeypatch):
    async_mock = AsyncMock(return_value=SAMPLE_STICKER_SET)
    monkeypatch.setattr("app.routers.emoji.get_sticker_set", async_mock)

    response = client.post(
        "/api/emoji/packs/import",
        cookies=auth_cookies,
        json={"url": "https://t.me/addemoji/MPSTATS_posts"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["short_name"] == "MPSTATS_posts"
    assert data["emoji_count"] == 2
    assert data["emojis"][0]["preview_url"].startswith("/api/emoji/preview/")

    list_response = client.get("/api/emoji/packs", cookies=auth_cookies)
    assert list_response.status_code == 200
    assert len(list_response.json()["packs"]) == 1


def test_preview_custom_emoji(client, auth_cookies, monkeypatch):
    async_mock = AsyncMock(return_value=SAMPLE_STICKER_SET)
    monkeypatch.setattr("app.routers.emoji.get_sticker_set", async_mock)

    client.post(
        "/api/emoji/packs/import",
        cookies=auth_cookies,
        json={"url": "https://t.me/addemoji/MPSTATS_posts"},
    )

    monkeypatch.setattr(
        "app.routers.emoji.get_telegram_file_path",
        AsyncMock(return_value="stickers/file.webp"),
    )
    monkeypatch.setattr(
        "app.routers.emoji.download_telegram_file",
        AsyncMock(return_value=b"webp-bytes"),
    )

    response = client.get(
        "/api/emoji/preview/5368324170671202286",
        cookies=auth_cookies,
    )
    assert response.status_code == 200
    assert response.content == b"webp-bytes"
    assert response.headers["content-type"] == "image/webp"


def test_delete_emoji_pack(client, auth_cookies, monkeypatch):
    async_mock = AsyncMock(return_value=SAMPLE_STICKER_SET)
    monkeypatch.setattr("app.routers.emoji.get_sticker_set", async_mock)

    client.post(
        "/api/emoji/packs/import",
        cookies=auth_cookies,
        json={"url": "https://t.me/addemoji/MPSTATS_posts"},
    )

    delete_response = client.delete("/api/emoji/packs/MPSTATS_posts", cookies=auth_cookies)
    assert delete_response.status_code == 204

    list_response = client.get("/api/emoji/packs", cookies=auth_cookies)
    assert list_response.json()["packs"] == []


def test_normalize_custom_emoji_markdown_adds_alt_from_pack():
    pack = sticker_set_to_pack(SAMPLE_STICKER_SET, "https://t.me/addemoji/MPSTATS_posts")
    alt_map = build_emoji_alt_map([pack])
    source = "Привет ![](tg://emoji?id=5368324170671202286)"
    normalized = normalize_custom_emoji_markdown(source, alt_map)
    assert normalized == "Привет ![📊](tg://emoji?id=5368324170671202286)"


def test_custom_emojis_to_telegram_html():
    pack = sticker_set_to_pack(SAMPLE_STICKER_SET, "https://t.me/addemoji/MPSTATS_posts")
    alt_map = build_emoji_alt_map([pack])
    source = custom_emoji_markdown("5368324170671202286", "📊")
    html = custom_emojis_to_telegram_html(source, alt_map)
    assert html == '<tg-emoji emoji-id="5368324170671202286">📊</tg-emoji>'


def test_prepare_custom_emojis_for_telegram_uses_html_tag(monkeypatch):
    pack = sticker_set_to_pack(SAMPLE_STICKER_SET, "https://t.me/addemoji/MPSTATS_posts")
    monkeypatch.setattr("app.settings_store.get_custom_emoji_packs", lambda db=None: [pack])

    import asyncio

    from app.telegram_client import prepare_custom_emojis_for_telegram

    prepared = asyncio.run(
        prepare_custom_emojis_for_telegram("Текст ![](tg://emoji?id=5368324170671202286) конец")
    )
    assert '<tg-emoji emoji-id="5368324170671202286">📊</tg-emoji>' in prepared
    assert "tg://emoji" not in prepared

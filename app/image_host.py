import re
from pathlib import Path

import httpx

from app.config import BASE_DIR

UPLOAD_DIR = BASE_DIR / "data" / "uploads"

MEDIA_MD_RE = re.compile(
    r'!\[([^\]]*)\]\((https?://[^)\s]+|/uploads/[^)\s]+)(?:\s+"([^"]*)")?\)',
    re.IGNORECASE,
)

VIDEO_EXT = {".mp4", ".webm", ".mov"}
AUDIO_EXT = {".mp3", ".ogg", ".wav", ".m4a", ".mpeg"}


def _local_filename(url: str) -> str | None:
    marker = "/uploads/"
    if marker not in url:
        return None
    filename = url.split(marker, 1)[1].split("?")[0].split('"')[0]
    if not filename or ".." in filename or "/" in filename:
        return None
    return filename


async def _upload_to_public_host(file_path: Path) -> str:
    content = file_path.read_bytes()

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://uguu.se/upload",
            files={"files[]": (file_path.name, content)},
        )
        response.raise_for_status()
        data = response.json()
        if data.get("success") and data.get("files"):
            url = data["files"][0].get("url", "")
            if url.startswith("https://"):
                return url

        response = await client.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            data={"reqtype": "fileupload", "time": "72h"},
            files={"fileToUpload": (file_path.name, content)},
        )
        response.raise_for_status()
        url = response.text.strip()
        if url.startswith("https://"):
            return url

    raise ValueError("Не удалось получить публичный URL файла")


async def resolve_media_for_telegram(markdown: str) -> str:
    """Заменяет локальные URL медиа на публичные HTTPS для Telegram."""
    result = markdown
    seen: set[str] = set()

    for match in MEDIA_MD_RE.finditer(markdown):
        url = match.group(2)
        if url in seen:
            continue
        seen.add(url)

        if url.startswith("https://") and "/uploads/" not in url:
            continue

        filename = _local_filename(url)
        if not filename:
            continue

        file_path = UPLOAD_DIR / filename
        if not file_path.is_file():
            raise ValueError(f"Файл не найден: {filename}")

        public_url = await _upload_to_public_host(file_path)
        result = result.replace(url, public_url)

    return result


# Обратная совместимость
resolve_images_for_telegram = resolve_media_for_telegram

import json
import re
from pathlib import Path

import httpx

from app.config import BASE_DIR

UPLOAD_DIR = BASE_DIR / "data" / "uploads"

IMAGE_MD_RE = re.compile(
    r'!\[([^\]]*)\]\((https?://[^)\s]+)(?:\s+"([^"]*)")?\)',
    re.IGNORECASE,
)


def _local_filename(url: str) -> str | None:
    """Извлекает имя файла, если URL указывает на наш /uploads/."""
    marker = "/uploads/"
    if marker not in url:
        return None
    filename = url.split(marker, 1)[1].split("?")[0].split('"')[0]
    if not filename or ".." in filename or "/" in filename:
        return None
    return filename


async def _upload_to_public_host(file_path: Path) -> str:
    """Загружает файл на публичный HTTPS-хостинг для Telegram."""
    content = file_path.read_bytes()

    async with httpx.AsyncClient(timeout=90.0) as client:
        # uguu.se — публичный HTTPS URL для Rich Messages
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

        # запасной вариант: litterbox (временные ссылки)
        response = await client.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            data={"reqtype": "fileupload", "time": "72h"},
            files={"fileToUpload": (file_path.name, content)},
        )
        response.raise_for_status()
        url = response.text.strip()
        if url.startswith("https://"):
            return url

    raise ValueError("Не удалось получить публичный URL изображения")


async def resolve_images_for_telegram(markdown: str) -> str:
    """
    Заменяет локальные URL картинок на публичные HTTPS.
    Telegram Rich Messages не могут скачать http://IP:8000/uploads/...
    """
    result = markdown
    seen: set[str] = set()

    for match in IMAGE_MD_RE.finditer(markdown):
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
            raise ValueError(f"Файл изображения не найден: {filename}")

        public_url = await _upload_to_public_host(file_path)
        result = result.replace(url, public_url)

    return result

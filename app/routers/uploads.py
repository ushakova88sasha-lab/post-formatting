import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import require_user
from app.config import BASE_DIR, settings

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = BASE_DIR / "data" / "uploads"
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB

MAGIC = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
}


def _detect_image_type(data: bytes) -> str | None:
    for sig, mime in MAGIC.items():
        if data.startswith(sig):
            return mime
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _public_url(filename: str) -> str:
    base = settings.public_base_url.rstrip("/")
    return f"{base}/uploads/{filename}"


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    _: str = Depends(require_user),
):
    if not file.content_type or file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Допустимые форматы: JPEG, PNG, WebP, GIF",
        )

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл слишком большой (максимум 10 МБ)",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пустой файл")

    detected = _detect_image_type(data)
    if not detected or detected != file.content_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректный файл изображения")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = ALLOWED_TYPES[detected]
    filename = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / filename
    path.write_bytes(data)

    return {"url": _public_url(filename), "filename": filename}

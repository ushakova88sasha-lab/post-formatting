import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import require_user
from app.config import BASE_DIR, settings

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = BASE_DIR / "data" / "uploads"

MEDIA_CONFIG = {
    "image/jpeg": (".jpg", 10 * 1024 * 1024, "image"),
    "image/png": (".png", 10 * 1024 * 1024, "image"),
    "image/webp": (".webp", 10 * 1024 * 1024, "image"),
    "image/gif": (".gif", 10 * 1024 * 1024, "image"),
    "video/mp4": (".mp4", 50 * 1024 * 1024, "video"),
    "video/webm": (".webm", 50 * 1024 * 1024, "video"),
    "video/quicktime": (".mov", 50 * 1024 * 1024, "video"),
    "audio/mpeg": (".mp3", 20 * 1024 * 1024, "audio"),
    "audio/mp3": (".mp3", 20 * 1024 * 1024, "audio"),
    "audio/ogg": (".ogg", 20 * 1024 * 1024, "audio"),
    "audio/wav": (".wav", 20 * 1024 * 1024, "audio"),
    "audio/x-wav": (".wav", 20 * 1024 * 1024, "audio"),
}


def _detect_media_type(data: bytes, content_type: str) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "video/mp4"
    if data.startswith(b"\x1aE\xdf\xa3"):
        return "video/webm"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if data.startswith(b"ID3") or data[:2] == b"\xff\xfb":
        return "audio/mpeg"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WAVE":
        return "audio/wav"
    if content_type in MEDIA_CONFIG:
        return content_type
    return None


def _public_url(filename: str) -> str:
    base = settings.public_base_url.rstrip("/")
    return f"{base}/uploads/{filename}"


async def _save_upload(file: UploadFile) -> dict:
    if not file.content_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестный тип файла")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пустой файл")

    detected = _detect_media_type(data, file.content_type)
    if not detected or detected not in MEDIA_CONFIG:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Формат: JPEG, PNG, WebP, GIF, MP4, WebM, MOV, MP3, OGG, WAV",
        )

    ext, max_size, kind = MEDIA_CONFIG[detected]
    if len(data) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Файл слишком большой (максимум {max_size // (1024 * 1024)} МБ)",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)

    return {"url": _public_url(filename), "filename": filename, "kind": kind}


@router.post("/image")
async def upload_image(file: UploadFile = File(...), _: str = Depends(require_user)):
    result = await _save_upload(file)
    if result["kind"] != "image":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ожидается изображение")
    return result


@router.post("/video")
async def upload_video(file: UploadFile = File(...), _: str = Depends(require_user)):
    result = await _save_upload(file)
    if result["kind"] != "video":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ожидается видео")
    return result


@router.post("/audio")
async def upload_audio(file: UploadFile = File(...), _: str = Depends(require_user)):
    result = await _save_upload(file)
    if result["kind"] != "audio":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ожидается аудио")
    return result


@router.post("/media")
async def upload_media(file: UploadFile = File(...), _: str = Depends(require_user)):
    return await _save_upload(file)

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_user
from app.custom_emoji import (
    CustomEmojiError,
    find_emoji_preview_file_id,
    packs_for_client,
    parse_pack_url,
    remove_pack,
    sticker_set_to_pack,
    upsert_pack,
)
from app.database import get_db
from app.settings_store import get_custom_emoji_packs, save_custom_emoji_packs
from app.telegram_client import (
    TelegramError,
    download_telegram_file,
    get_sticker_set,
    get_telegram_file_path,
)

router = APIRouter(prefix="/api/emoji", tags=["emoji"])


class EmojiPackImportRequest(BaseModel):
    url: str = Field(..., min_length=1)


class EmojiPackListResponse(BaseModel):
    packs: list[dict]


def _guess_media_type(file_path: str) -> str:
    lowered = file_path.lower()
    if lowered.endswith(".webp"):
        return "image/webp"
    if lowered.endswith(".png"):
        return "image/png"
    if lowered.endswith(".jpg") or lowered.endswith(".jpeg"):
        return "image/jpeg"
    return "application/octet-stream"


async def _import_pack_from_url(url: str, db: Session) -> dict:
    short_name = parse_pack_url(url)
    try:
        sticker_set = await get_sticker_set(short_name)
    except TelegramError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        pack = sticker_set_to_pack(sticker_set, url)
    except CustomEmojiError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    packs = upsert_pack(get_custom_emoji_packs(db), pack)
    save_custom_emoji_packs(db, packs)
    client_packs = packs_for_client(packs)
    return next(item for item in client_packs if item["short_name"] == pack["short_name"])


@router.get("/packs", response_model=EmojiPackListResponse)
async def list_emoji_packs(db: Session = Depends(get_db), _: str = Depends(require_user)):
    packs = get_custom_emoji_packs(db)
    return EmojiPackListResponse(packs=packs_for_client(packs))


@router.post("/packs/import", response_model=dict)
async def import_emoji_pack(
    payload: EmojiPackImportRequest,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    try:
        return await _import_pack_from_url(payload.url, db)
    except CustomEmojiError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/packs/{short_name}/refresh", response_model=dict)
async def refresh_emoji_pack(
    short_name: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    packs = get_custom_emoji_packs(db)
    pack = next((item for item in packs if item.get("short_name") == short_name), None)
    if not pack:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Набор не найден")

    source_url = pack.get("source_url") or f"https://t.me/addemoji/{short_name}"
    try:
        return await _import_pack_from_url(source_url, db)
    except CustomEmojiError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/packs/{short_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_emoji_pack(
    short_name: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    packs = get_custom_emoji_packs(db)
    if not any(item.get("short_name") == short_name for item in packs):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Набор не найден")

    save_custom_emoji_packs(db, remove_pack(packs, short_name))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/preview/{emoji_id}")
async def preview_custom_emoji(
    emoji_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_user),
):
    packs = get_custom_emoji_packs(db)
    file_id = find_emoji_preview_file_id(packs, emoji_id)
    if not file_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Превью не найдено")

    try:
        file_path = await get_telegram_file_path(file_id)
        content = await download_telegram_file(file_path)
    except TelegramError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return Response(
        content=content,
        media_type=_guess_media_type(file_path),
        headers={"Cache-Control": "public, max-age=86400"},
    )

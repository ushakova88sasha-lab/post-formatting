from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.buttons import record_click, visitor_hash_from_request
from app.database import get_db

router = APIRouter(tags=["clicks"])


@router.get("/go/{click_token}")
async def track_button_click(
    click_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    user_agent = request.headers.get("user-agent")
    visitor_hash = visitor_hash_from_request(
        request.client.host if request.client else None,
        user_agent,
        request.headers.get("x-forwarded-for"),
    )
    try:
        target_url = record_click(
            db,
            click_token,
            visitor_hash=visitor_hash,
            user_agent=user_agent,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Ссылка не найдена") from exc

    return RedirectResponse(url=target_url, status_code=302)

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.buttons import record_click
from app.database import get_db

router = APIRouter(tags=["clicks"])


@router.get("/go/{click_token}")
async def track_button_click(
    click_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    user_agent = request.headers.get("user-agent")
    try:
        target_url = record_click(db, click_token, user_agent=user_agent)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Ссылка не найдена") from exc

    return RedirectResponse(url=target_url, status_code=302)

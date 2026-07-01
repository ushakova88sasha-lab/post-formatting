from fastapi import Depends, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import settings

serializer = URLSafeTimedSerializer(settings.session_secret)
SESSION_COOKIE = "session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 дней


def verify_password(plain: str) -> bool:
    return plain == settings.admin_password


def create_session_token(username: str) -> str:
    return serializer.dumps({"username": username})


def decode_session_token(token: str) -> str | None:
    try:
        data = serializer.loads(token, max_age=SESSION_MAX_AGE)
        return data.get("username")
    except (BadSignature, SignatureExpired):
        return None


def get_current_user(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")

    username = decode_session_token(token)
    if not username or username != settings.admin_username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия недействительна")

    return username


def require_user(user: str = Depends(get_current_user)) -> str:
    return user

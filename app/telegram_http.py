import httpx

from app.config import settings


def telegram_client_kwargs(timeout: float) -> dict:
    kwargs: dict = {"timeout": timeout}
    proxy_url = settings.telegram_proxy_url.strip()
    if proxy_url:
        kwargs["proxy"] = proxy_url
    return kwargs


def telegram_async_client(timeout: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(**telegram_client_kwargs(timeout))

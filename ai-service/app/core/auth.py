import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


async def require_internal_token(
    token: Annotated[str | None, Header(alias="X-Internal-Token")] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    configured_token = settings.ai_service_internal_token
    if not configured_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal authentication is not configured",
        )
    if token is None or not secrets.compare_digest(
        token.encode("utf-8"), configured_token.encode("utf-8")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal credentials",
        )

import uuid
from datetime import datetime
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from app.auth.jwt import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.auth.dependencies import get_current_user
from app.auth.rate_limit import rate_limit
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.models.settings import AppSetting

settings = get_settings()

_login_limit = rate_limit(max_calls=10, window_seconds=60)

router = APIRouter(prefix="/auth", tags=["auth"])

# El refresh token vive solo en una cookie httpOnly — nunca es legible por JS,
# a diferencia del access token (corta duración, sí expuesto al frontend).
REFRESH_COOKIE_NAME = "cg_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(
    response: Response,
    refresh_token: str,
    *,
    cookie_name: str = REFRESH_COOKIE_NAME,
    path: str = REFRESH_COOKIE_PATH,
) -> None:
    response.set_cookie(
        key=cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path=path,
    )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    is_admin: bool
    currency: str
    timezone: str = "UTC"
    has_avatar: bool = False
    must_change_password: bool = False
    receive_reminders: bool = True
    reminder_hour: int = 8
    reminders_globally_enabled: bool = True

    model_config = {"from_attributes": True}

    @classmethod
    def from_user(cls, user: "User", *, reminders_globally_enabled: bool = True) -> "MeOut":
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            is_admin=user.is_admin,
            currency=user.currency,
            timezone=user.timezone,
            has_avatar=user.avatar_key is not None,
            must_change_password=getattr(user, 'must_change_password', False),
            receive_reminders=getattr(user, 'receive_reminders', True),
            reminder_hour=getattr(user, 'reminder_hour', 8),
            reminders_globally_enabled=reminders_globally_enabled,
        )


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(_login_limit)])
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta desactivada")
    if user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usa el acceso de administrador")

    user.last_login_at = datetime.utcnow()
    await db.commit()

    _set_refresh_cookie(response, create_refresh_token(user.id, user.token_version))
    return TokenResponse(access_token=create_access_token(user.id, user.token_version))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    db: AsyncSession = Depends(get_db),
    cg_refresh: str | None = Cookie(default=None),
):
    from jose import JWTError
    import uuid
    try:
        payload = decode_token(cg_refresh or "")
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = uuid.UUID(payload["sub"])
        token_ver = payload.get("ver")
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no válido")
    if token_ver is None or token_ver != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión expirada. Inicia sesión nuevamente.")

    _set_refresh_cookie(response, create_refresh_token(user.id, user.token_version))
    return TokenResponse(access_token=create_access_token(user.id, user.token_version))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)


async def _reminders_globally_enabled(db: AsyncSession) -> bool:
    row = (await db.execute(
        select(AppSetting).where(AppSetting.key == "reminder_enabled")
    )).scalar_one_or_none()
    if row is None:
        return True
    return (row.value or "true").lower() not in ("false", "0", "no")


@router.get("/me", response_model=MeOut)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    globally_enabled = await _reminders_globally_enabled(db)
    return MeOut.from_user(current_user, reminders_globally_enabled=globally_enabled)

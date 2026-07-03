"""
Perfil del usuario autenticado — /api/v1/me
"""
import asyncio
import uuid
from typing import Optional
from fastapi import APIRouter, Cookie, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token, create_refresh_token, hash_password, verify_password
from app.database import get_db
from app.models.user import User
from app.routers.admin import ADMIN_REFRESH_COOKIE_NAME, ADMIN_REFRESH_COOKIE_PATH
from app.routers.auth import MeOut, _reminders_globally_enabled, _set_refresh_cookie
from app.services import email as email_service

router = APIRouter(prefix="/me", tags=["profile"])

AVATAR_MIME = {"image/jpeg", "image/png", "image/webp"}
AVATAR_EXT_BY_MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    receive_reminders: Optional[bool] = None
    reminder_hour: Optional[int] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PasswordChangeResponse(BaseModel):
    access_token: str


class AddTagPayload(BaseModel):
    tag: str


@router.get("", response_model=MeOut)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    globally_enabled = await _reminders_globally_enabled(db)
    return MeOut.from_user(current_user, reminders_globally_enabled=globally_enabled)


@router.patch("", response_model=MeOut)
async def update_me(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        current_user.name = body.name.strip()

    if body.currency is not None:
        if len(body.currency) != 3:
            raise HTTPException(status_code=400, detail="La moneda debe ser un código de 3 letras (ISO 4217)")
        current_user.currency = body.currency.upper()

    if body.timezone is not None:
        if not body.timezone.strip():
            raise HTTPException(status_code=400, detail="La zona horaria no puede estar vacía")
        current_user.timezone = body.timezone.strip()

    if body.receive_reminders is not None:
        current_user.receive_reminders = body.receive_reminders

    if body.reminder_hour is not None:
        if not (0 <= body.reminder_hour <= 23):
            raise HTTPException(status_code=400, detail="La hora debe estar entre 0 y 23")
        current_user.reminder_hour = body.reminder_hour

    await db.commit()
    await db.refresh(current_user)
    globally_enabled = await _reminders_globally_enabled(db)
    return MeOut.from_user(current_user, reminders_globally_enabled=globally_enabled)


@router.patch("/password", response_model=PasswordChangeResponse)
async def change_password(
    body: PasswordChange,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    cg_refresh: str | None = Cookie(default=None),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 8 caracteres")
    if verify_password(body.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="La nueva contraseña no puede ser igual a la actual")
    current_user.password_hash = hash_password(body.new_password)
    current_user.token_version = (current_user.token_version or 0) + 1
    current_user.must_change_password = False
    await db.commit()

    await email_service.send_password_changed(
        db, to_email=current_user.email, name=current_user.name, by_admin=False
    )

    # El cambio de password sube token_version e invalida todas las sesiones
    # existentes (incluida la que hace esta misma petición) — reemitimos
    # credenciales para que la sesión actual siga funcionando en vez de
    # quedar con un token fantasma. La cookie de refresh de admin está
    # scoped a /api/v1/admin, así que nunca llega a esta ruta (/api/v1/me) —
    # por eso se decide por rol y no por la cookie recibida.
    if current_user.is_admin:
        _set_refresh_cookie(
            response, create_refresh_token(current_user.id, current_user.token_version),
            cookie_name=ADMIN_REFRESH_COOKIE_NAME, path=ADMIN_REFRESH_COOKIE_PATH,
        )
    if cg_refresh is not None:
        _set_refresh_cookie(response, create_refresh_token(current_user.id, current_user.token_version))

    return PasswordChangeResponse(
        access_token=create_access_token(current_user.id, current_user.token_version)
    )


@router.post("/avatar", response_model=MeOut, status_code=status.HTTP_200_OK)
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in AVATAR_MIME:
        raise HTTPException(status_code=400, detail="Tipo no permitido. Usa JPEG, PNG o WebP")

    content = await file.read()
    if len(content) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="El avatar supera el límite de 5 MB")

    ext = AVATAR_EXT_BY_MIME[file.content_type]
    new_key = f"avatars/{current_user.id}/{uuid.uuid4()}.{ext}"

    from app import storage
    loop = asyncio.get_event_loop()

    # Eliminar avatar anterior
    if current_user.avatar_key:
        try:
            old_key = current_user.avatar_key
            await loop.run_in_executor(None, storage.delete_object, old_key)
        except Exception:
            pass

    await loop.run_in_executor(None, storage.upload_bytes, content, new_key, file.content_type)

    current_user.avatar_key = new_key
    await db.commit()
    await db.refresh(current_user)
    return MeOut.from_user(current_user)


@router.delete("/avatar", response_model=MeOut)
async def delete_avatar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.avatar_key:
        raise HTTPException(status_code=404, detail="Sin avatar")

    from app import storage
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, storage.delete_object, current_user.avatar_key)
    except Exception:
        pass

    current_user.avatar_key = None
    await db.commit()
    await db.refresh(current_user)
    return MeOut.from_user(current_user)


@router.get("/responsible-tags", response_model=list[str])
async def get_responsible_tags(current_user: User = Depends(get_current_user)):
    return current_user.responsible_tags or []


@router.post("/responsible-tags", response_model=list[str])
async def add_responsible_tag(
    body: AddTagPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tag = body.tag.strip()
    if not tag:
        raise HTTPException(status_code=400, detail="El tag no puede estar vacío")
    current_tags: list = list(current_user.responsible_tags or [])
    updated = [tag] + [t for t in current_tags if t != tag]
    updated = updated[:30]
    current_user.responsible_tags = updated
    await db.commit()
    return updated


@router.get("/avatar/content")
async def get_avatar_content(current_user: User = Depends(get_current_user)):
    if not current_user.avatar_key:
        raise HTTPException(status_code=404, detail="Sin avatar")

    from app import storage
    loop = asyncio.get_event_loop()
    data, content_type = await loop.run_in_executor(None, storage.download_bytes, current_user.avatar_key)

    return StreamingResponse(
        iter([data]),
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )

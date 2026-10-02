"""
Vinculación de canales (Telegram/WhatsApp) — /api/v1/channels

Flujo pensado para que n8n (u otro orquestador) resuelva qué usuario es
cada mensaje entrante sin gestionar tokens por usuario:

  1. POST /channels/link-codes  (sesión de usuario) → genera un código de un
     solo uso, vigente 10 minutos.
  2. El usuario envía ese código por el canal que quiere vincular.
  3. POST /channels/link        (solo n8n, con X-Integration-Key — el código
     es la prueba de que el usuario controla ese chat_id/número) → n8n llama
     esto con el código recibido y el channel_id real del remitente.
  4. De ahí en más, /ingestion/* acepta headers X-Channel + X-Channel-Id (más
     X-Integration-Key) en vez de Bearer <ingestion_token> — ver
     _authenticate_ingestion y app.auth.integration.
"""
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.auth.integration import require_integration_key
from app.auth.rate_limit import rate_limit
from app.database import get_db
from app.models.user import User
from app.models.channel_link import Channel, UserChannelLink, ChannelLinkCode

router = APIRouter(prefix="/channels", tags=["channels"])

_LINK_CODE_TTL_MINUTES = 10
_link_attempt_limit = rate_limit(max_calls=20, window_seconds=300)


def _gen_code() -> str:
    return secrets.token_hex(4).upper()


# ─── Generar código (sesión de usuario) ───────────────────────────────────────

class LinkCodeRequest(BaseModel):
    channel: Channel


class LinkCodeOut(BaseModel):
    code: str
    channel: Channel
    expires_at: datetime


@router.post("/link-codes", response_model=LinkCodeOut, status_code=status.HTTP_201_CREATED)
async def create_link_code(
    body: LinkCodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Invalida códigos previos sin usar del mismo usuario/canal — uno vigente a la vez.
    previous = (await db.execute(
        select(ChannelLinkCode).where(
            ChannelLinkCode.user_id == current_user.id,
            ChannelLinkCode.channel == body.channel,
            ChannelLinkCode.used_at.is_(None),
        )
    )).scalars().all()
    for c in previous:
        c.used_at = datetime.utcnow()

    expires_at = datetime.utcnow() + timedelta(minutes=_LINK_CODE_TTL_MINUTES)
    link_code = ChannelLinkCode(
        user_id=current_user.id, channel=body.channel, code=_gen_code(), expires_at=expires_at,
    )
    db.add(link_code)
    await db.commit()

    return LinkCodeOut(code=link_code.code, channel=body.channel, expires_at=expires_at)


# ─── Confirmar vínculo (solo integración — el código es la prueba) ──────────

class LinkConfirmRequest(BaseModel):
    code: str
    channel: Channel
    channel_id: str
    label: Optional[str] = None


@router.post(
    "/link",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_link_attempt_limit), Depends(require_integration_key)],
)
async def confirm_link(body: LinkConfirmRequest, db: AsyncSession = Depends(get_db)):
    """
    Sin autenticación de sesión — el código de un solo uso es la prueba de
    identidad del usuario, y X-Integration-Key la de que quien llama es n8n
    (sin ella cualquiera podría vincular un channel_id arbitrario adivinando
    códigos). n8n lo llama apenas recibe el mensaje con el código, usando el
    channel_id real del remitente (chat_id/número).
    """
    link_code = (await db.execute(
        select(ChannelLinkCode).where(
            ChannelLinkCode.code == body.code.strip().upper(),
            ChannelLinkCode.channel == body.channel,
            ChannelLinkCode.used_at.is_(None),
        )
    )).scalar_one_or_none()

    if not link_code or link_code.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    link_code.used_at = datetime.utcnow()

    existing = (await db.execute(
        select(UserChannelLink).where(
            UserChannelLink.channel == body.channel,
            UserChannelLink.channel_id == body.channel_id,
        )
    )).scalar_one_or_none()
    if existing:
        existing.user_id = link_code.user_id
        existing.label = body.label
    else:
        db.add(UserChannelLink(
            user_id=link_code.user_id, channel=body.channel,
            channel_id=body.channel_id, label=body.label,
        ))

    await db.commit()
    return {"status": "linked"}


# ─── Gestión (sesión de usuario) ──────────────────────────────────────────────

class ChannelLinkOut(BaseModel):
    id: uuid.UUID
    channel: Channel
    channel_id: str
    label: Optional[str]
    linked_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ChannelLinkOut])
async def list_links(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserChannelLink)
        .where(UserChannelLink.user_id == current_user.id)
        .order_by(UserChannelLink.linked_at.desc())
    )
    return result.scalars().all()


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    link_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = (await db.execute(
        select(UserChannelLink).where(
            UserChannelLink.id == link_id,
            UserChannelLink.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Vínculo no encontrado")
    await db.delete(link)
    await db.commit()

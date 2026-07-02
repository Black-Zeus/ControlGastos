"""
Tokens de ingesta (gestión por el propio usuario) + endpoint de ingesta de recibos.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.ingestion import IngestionToken
from app.models.transaction import Expense, Attachment, ReviewStatus, TransactionSource
from app.models.catalog import Category

router = APIRouter(tags=["ingestion"])


# ─── Gestión de tokens (usuario autenticado) ─────────────────────────────────

class TokenCreate(BaseModel):
    label: str


class TokenOut(BaseModel):
    id: uuid.UUID
    label: str
    active: bool
    last_used_at: datetime | None

    model_config = {"from_attributes": True}


@router.get("/ingestion-tokens", response_model=list[TokenOut])
async def list_tokens(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IngestionToken)
        .where(IngestionToken.user_id == current_user.id)
        .order_by(IngestionToken.created_at.desc())
    )
    return result.scalars().all()


@router.post("/ingestion-tokens", status_code=status.HTTP_201_CREATED)
async def create_token(
    body: TokenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    token = IngestionToken(
        user_id=current_user.id,
        token_hash=token_hash,
        label=body.label,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)
    # El token en claro solo se devuelve una vez; no se puede recuperar después.
    return {"id": token.id, "label": token.label, "token": raw_token}


@router.delete("/ingestion-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = (await db.execute(
        select(IngestionToken).where(
            IngestionToken.id == token_id,
            IngestionToken.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token no encontrado")
    token.active = False
    await db.commit()


# ─── Endpoint público de ingesta (autenticado por token) ─────────────────────

@router.post("/ingestion/receipts", status_code=status.HTTP_201_CREATED)
async def ingest_receipt(
    file: UploadFile = File(...),
    note: str | None = Form(default=None),
    x_ingestion_token: str = Depends(lambda req: req.headers.get("Authorization", "").removeprefix("Bearer ")),
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint para sistemas externos (bots, automatizaciones).
    Autenticación: Bearer <ingestion_token> (el token en claro, no el hash).
    Crea un gasto en estado 'borrador' que el usuario debe confirmar desde la app.
    """
    if not x_ingestion_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de ingesta requerido")

    token_hash = hashlib.sha256(x_ingestion_token.encode()).hexdigest()
    token = (await db.execute(
        select(IngestionToken).where(
            IngestionToken.token_hash == token_hash,
            IngestionToken.active.is_(True),
        )
    )).scalar_one_or_none()

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o revocado")

    # Obtener categoría "Otros" de sistema como fallback
    otros = (await db.execute(
        select(Category).where(Category.name == "Otros", Category.is_system.is_(True))
    )).scalar_one_or_none()

    from datetime import date
    expense = Expense(
        user_id=token.user_id,
        date=date.today(),
        label=note or "Recibo pendiente de revisión",
        category_id=otros.id if otros else None,
        amount=0,
        review_status=ReviewStatus.borrador,
        source=TransactionSource.ingestion,
        observation=note,
    )
    db.add(expense)

    # Actualizar last_used_at
    token.last_used_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(expense)

    # TODO: encolar job OCR con expense.id + file content

    return {"expense_id": expense.id, "status": "borrador", "message": "Recibo recibido, pendiente de revisión"}

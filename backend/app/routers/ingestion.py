"""
Tokens de ingesta (gestión por el propio usuario) + endpoint de ingesta de recibos.

Flujo pensado para integraciones externas (bots de wsp/telegram vía n8n):
  1. POST /ingestion/receipts       → sube la imagen, crea Expense en borrador + Attachment.
  2. GET  /ingestion/receipts/{id}/status → polling hasta que el OCR (worker aparte) termine.
  3. POST /ingestion/receipts/{id}/confirm → confirma/corrige monto-categoría-fecha y cierra el borrador.
"""
import asyncio
import hashlib
import os
import secrets
import uuid
from datetime import date as date_cls, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.ingestion import IngestionToken
from app.models.transaction import Expense, Attachment, ReviewStatus, TransactionSource
from app.models.catalog import Category
from app.routers.expenses import _build_out as _build_expense_out, _get_open_period, _assert_expense_editable
from app.services.receipt_parsing import remember_merchant_category

router = APIRouter(tags=["ingestion"])

ALLOWED_MIME = {"image/jpeg", "image/png"}
MAX_BYTES = 20 * 1024 * 1024  # 20 MB
_MAGIC: dict[str, bytes] = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
}


def _check_magic(content: bytes, mime: str) -> bool:
    magic = _MAGIC.get(mime)
    return magic is not None and content[:len(magic)] == magic


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

def _extract_ingestion_token(request: Request) -> str:
    return request.headers.get("Authorization", "").removeprefix("Bearer ")


async def _authenticate_ingestion(
    x_ingestion_token: str = Depends(_extract_ingestion_token),
    db: AsyncSession = Depends(get_db),
) -> IngestionToken:
    """Resuelve y valida el token de ingesta; comparte sesión de DB con el endpoint."""
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

    token.last_used_at = datetime.utcnow()
    return token


async def _get_ingested_expense(
    expense_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> Expense:
    """
    Resuelve un recibo alcanzable por el token de ingesta — acotado a
    borradores propios creados por esa misma vía. Un egreso ya confirmado
    (o de cualquier otro origen) no es visible ni modificable por acá:
    404 en vez de 409 para no filtrar siquiera que existe.
    """
    expense = (await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id,
            Expense.source == TransactionSource.ingestion,
            Expense.review_status == ReviewStatus.borrador,
        )
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    return expense


class ReceiptOut(BaseModel):
    expense_id: uuid.UUID
    status: str
    message: str


@router.post("/ingestion/receipts", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
async def ingest_receipt(
    file: UploadFile = File(...),
    note: str | None = Form(default=None),
    token: IngestionToken = Depends(_authenticate_ingestion),
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint para sistemas externos (bots, automatizaciones vía n8n).
    Autenticación: Bearer <ingestion_token> (el token en claro, no el hash).
    Sube la imagen del recibo y crea un gasto en estado 'borrador' + su Attachment,
    a la espera de que el worker OCR procese la imagen (ver GET .../status).
    """
    claimed_mime = file.content_type or ""
    if claimed_mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo no permitido. Usa: {', '.join(sorted(ALLOWED_MIME))}",
        )

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera el límite de 20 MB")
    if not _check_magic(content, claimed_mime):
        raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con el tipo declarado")

    open_period = await _get_open_period(db, token.user_id)

    # Obtener categoría "Otros" de sistema como fallback — debe existir (seed al startup).
    otros = (await db.execute(
        select(Category).where(Category.name == "Otros", Category.is_system.is_(True))
    )).scalar_one_or_none()
    if not otros:
        raise HTTPException(status_code=500, detail="Categoría de sistema 'Otros' no encontrada")

    expense = Expense(
        user_id=token.user_id,
        period_id=open_period.id,
        date=date_cls.today(),
        label=note or "Recibo pendiente de revisión",
        category_id=otros.id,
        amount=0,
        obviable=True,  # default para egresos por ingesta — el usuario lo corrige con /modificar si no aplica
        review_status=ReviewStatus.borrador,
        source=TransactionSource.ingestion,
        observation=note,
    )
    db.add(expense)
    await db.flush()  # asigna expense.id sin cerrar la transacción

    safe_name = os.path.basename(file.filename or "recibo")
    storage_key = f"attachments/{token.user_id}/{expense.id}/{uuid.uuid4()}/{safe_name}"

    from app import storage
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, storage.upload_bytes, content, storage_key, claimed_mime)

    attachment = Attachment(
        expense_id=expense.id,
        user_id=token.user_id,
        storage_key=storage_key,
        original_filename=safe_name,
        mime_type=claimed_mime,
        size_bytes=len(content),
    )
    db.add(attachment)

    await db.commit()
    await db.refresh(expense)

    return ReceiptOut(
        expense_id=expense.id,
        status="borrador",
        message="Recibo recibido, pendiente de OCR. Consulta GET /ingestion/receipts/{id}/status.",
    )


class ReceiptStatusOut(BaseModel):
    expense_id: uuid.UUID
    review_status: str
    ocr_status: str  # pending | done
    ocr_raw_text: Optional[str]
    date: date_cls
    label: str
    amount: Decimal
    category_id: uuid.UUID
    category_name: str
    tipo: str  # recurrente | puntual — heredado de la categoría, no se elige por separado
    obviable: bool
    observation: Optional[str]
    message: str  # texto listo para mostrar en el chat (n8n/humano)

    model_config = {"from_attributes": True}


@router.get("/ingestion/receipts/{expense_id}/status", response_model=ReceiptStatusOut)
async def get_receipt_status(
    expense_id: uuid.UUID,
    token: IngestionToken = Depends(_authenticate_ingestion),
    db: AsyncSession = Depends(get_db),
):
    """Polling: consulta si el worker OCR ya procesó la imagen y qué propuso (monto/categoría)."""
    expense = await _get_ingested_expense(expense_id, token.user_id, db)

    attachment = (await db.execute(
        select(Attachment)
        .where(Attachment.expense_id == expense_id)
        .order_by(Attachment.uploaded_at.desc())
    )).scalars().first()

    category = (await db.execute(
        select(Category).where(Category.id == expense.category_id)
    )).scalar_one_or_none()

    await db.commit()  # persiste last_used_at del token

    ocr_status = "done" if (attachment and attachment.ocr_raw_text is not None) else "pending"
    category_name = category.name if category else "Sin categoría"
    tipo = category.type.value if category else "puntual"

    if ocr_status == "pending":
        message = "Se ha recibido un registro de egreso. Aún procesando la imagen (OCR pendiente) — vuelve a consultar en unos segundos."
    else:
        monto = f"${expense.amount:,.0f}".replace(",", ".") if expense.amount else "no detectado — indícalo con /modificar monto:<valor>"
        message = (
            "Se ha recibido un registro de egreso\n"
            f"Glosa: {expense.observation or expense.label}\n"
            f"Monto: {monto}\n"
            f"Categoría: {category_name}\n"
            f"Tipo: {'Recurrente' if tipo == 'recurrente' else 'Puntual'}\n"
            f"Obviable: {'Sí' if expense.obviable else 'No'}"
        )

    return ReceiptStatusOut(
        expense_id=expense.id,
        review_status=expense.review_status.value,
        ocr_status=ocr_status,
        ocr_raw_text=attachment.ocr_raw_text if attachment else None,
        date=expense.date,
        label=expense.label,
        amount=expense.amount,
        category_id=expense.category_id,
        category_name=category_name,
        tipo=tipo,
        obviable=expense.obviable,
        observation=expense.observation,
        message=message,
    )


class ReceiptConfirm(BaseModel):
    """
    Todos los campos son opcionales: /aceptar manda body vacío ({}) y toma
    la propuesta que dejó el worker OCR (amount/category_id ya escritos en
    el Expense); /modificar manda solo los campos que cambian — el resto
    queda tal cual estaba propuesto.
    """
    amount: Optional[Decimal] = None
    category_id: Optional[uuid.UUID] = None
    date: Optional[date_cls] = None
    label: Optional[str] = None
    observation: Optional[str] = None
    obviable: Optional[bool] = None


@router.post("/ingestion/receipts/{expense_id}/confirm")
async def confirm_receipt(
    expense_id: uuid.UUID,
    body: ReceiptConfirm,
    token: IngestionToken = Depends(_authenticate_ingestion),
    db: AsyncSession = Depends(get_db),
):
    """
    Confirma la propuesta del recibo (/aceptar, body vacío) o la corrige antes
    de confirmar (/modificar, con los campos a cambiar) y cierra el borrador.
    """
    expense = await _get_ingested_expense(expense_id, token.user_id, db)
    await _assert_expense_editable(expense, db)

    if body.category_id is not None:
        category = (await db.execute(
            select(Category).where(Category.id == body.category_id)
        )).scalar_one_or_none()
        if not category:
            raise HTTPException(status_code=400, detail="Categoría no encontrada")
        expense.category_id = body.category_id

    if body.amount is not None:
        expense.amount = body.amount
    if expense.amount == 0:
        raise HTTPException(
            status_code=400,
            detail="No se pudo leer el monto automáticamente. Indícalo con /modificar monto:<valor>",
        )
    if body.date is not None:
        expense.date = body.date
    if body.label is not None:
        expense.label = body.label
    if body.observation is not None:
        expense.observation = body.observation
    if body.obviable is not None:
        expense.obviable = body.obviable
    expense.review_status = ReviewStatus.confirmado

    attachment = (await db.execute(
        select(Attachment)
        .where(Attachment.expense_id == expense_id)
        .order_by(Attachment.uploaded_at.desc())
    )).scalars().first()
    if attachment and attachment.ocr_raw_text:
        await remember_merchant_category(db, token.user_id, attachment.ocr_raw_text, expense.category_id)

    await db.commit()
    await db.refresh(expense)

    category = (await db.execute(
        select(Category).where(Category.id == expense.category_id)
    )).scalar_one_or_none()

    return _build_expense_out(expense, category, attachment_count=1)


@router.delete("/ingestion/receipts/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_receipt(
    expense_id: uuid.UUID,
    token: IngestionToken = Depends(_authenticate_ingestion),
    db: AsyncSession = Depends(get_db),
):
    """
    Descarta un recibo en borrador (comando /cancelar). Borra el Expense y su
    Attachment — solo permitido mientras siga en borrador; un recibo ya
    confirmado no se cancela por acá (se edita/elimina desde la app).
    """
    expense = await _get_ingested_expense(expense_id, token.user_id, db)

    attachments = (await db.execute(
        select(Attachment).where(Attachment.expense_id == expense_id)
    )).scalars().all()

    from app import storage
    loop = asyncio.get_event_loop()
    for attachment in attachments:
        try:
            await loop.run_in_executor(None, storage.delete_object, attachment.storage_key)
        except Exception:
            pass  # si MinIO falla, igual se borra el registro

    await db.delete(expense)  # cascade borra los Attachment asociados
    await db.commit()

"""
Egresos del usuario autenticado — /api/v1/expenses

Regla de períodos:
  - Todo egreso se vincula al período ABIERTO al momento de su creación (period_id).
  - La fecha del egreso es solo metadata informativa (ej: pago de sueldo el 30/jun).
  - Un egreso solo puede modificarse/eliminarse si su período está abierto.
  - Si no existe período abierto, no se puede crear egresos.
"""
import asyncio
import enum
import logging
import uuid
from datetime import datetime
from datetime import date as date_cls
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.transaction import Expense, Attachment, PaymentStatus, ReviewStatus, TransactionSource
from app.models.catalog import Category
from app.models.period import Period, PeriodStatus
from app.models.merchant_memory import MerchantCategoryMemory
from app.services.period_rules import assert_date_in_period, period_bounds
from app.services.receipt_parsing import run_ocr, guess_amount, guess_category

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/expenses", tags=["expenses"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ExpenseOut(BaseModel):
    id: uuid.UUID
    period_id: Optional[uuid.UUID]
    date: date_cls
    label: str
    amount: Decimal
    category_id: uuid.UUID
    category_name: str
    category_type: str
    obviable: bool
    payment_status: str
    review_status: str
    source: str
    observation: Optional[str]
    responsible_tag: Optional[str]
    created_at: datetime
    attachment_count: int = 0
    shopping_list_id: Optional[uuid.UUID] = None
    items: Optional[list[dict]] = None
    items_from_list: bool = False

    model_config = {"from_attributes": True}


class ExpenseItemIn(BaseModel):
    """Ítem del desglose manual de un egreso compuesto (ver expenses.items)."""
    label: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(gt=0)


class ExpenseCreate(BaseModel):
    date: date_cls
    label: str
    category_id: uuid.UUID
    amount: Decimal
    obviable: bool = False
    payment_status: PaymentStatus = PaymentStatus.pendiente
    observation: Optional[str] = None
    responsible_tag: Optional[str] = None
    # Desglose opcional: si viene, el monto del egreso pasa a ser la suma de los ítems.
    items: Optional[list[ExpenseItemIn]] = None


class ExpenseUpdate(BaseModel):
    date: Optional[date_cls] = None
    label: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    amount: Optional[Decimal] = None
    obviable: Optional[bool] = None
    payment_status: Optional[PaymentStatus] = None
    review_status: Optional[ReviewStatus] = None
    observation: Optional[str] = None
    responsible_tag: Optional[str] = None
    # None = no tocar el desglose; [] = quitarlo; lista = reemplazarlo (y recalcular el monto).
    items: Optional[list[ExpenseItemIn]] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _items_snapshot(items: list[ExpenseItemIn]) -> tuple[list[dict], Decimal]:
    """Serializa el desglose manual para JSONB y devuelve también su total."""
    snapshot = [{"label": i.label.strip(), "amount": str(i.amount)} for i in items]
    if any(not row["label"] for row in snapshot):
        raise HTTPException(status_code=400, detail="Cada ítem del desglose necesita una descripción")
    return snapshot, sum((i.amount for i in items), Decimal("0"))


async def _period_of(period_id: Optional[uuid.UUID], db: AsyncSession, user_id: uuid.UUID) -> Period:
    """Período del registro (abierto, porque solo se editan registros de un período abierto);
    si no tiene, el período abierto actual."""
    if period_id:
        period = (await db.execute(select(Period).where(Period.id == period_id))).scalar_one_or_none()
        if period:
            return period
    return await _get_open_period(db, user_id)


async def _get_open_period(db: AsyncSession, user_id: uuid.UUID) -> Period:
    """Devuelve el período abierto o lanza 409."""
    period = (await db.execute(
        select(Period).where(
            Period.user_id == user_id,
            Period.status == PeriodStatus.abierto,
        )
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(
            status_code=409,
            detail="No hay período abierto. Abre un período antes de registrar egresos.",
        )
    return period


async def _assert_expense_editable(expense: Expense, db: AsyncSession) -> None:
    """Lanza 409 si el período del egreso está cerrado."""
    if expense.period_id is None:
        return
    period = (await db.execute(
        select(Period).where(Period.id == expense.period_id)
    )).scalar_one_or_none()
    if period and period.status == PeriodStatus.cerrado:
        raise HTTPException(
            status_code=409,
            detail="El período de este egreso está cerrado. No se pueden hacer cambios.",
        )


def _build_out(expense: Expense, cat: Optional[Category], attachment_count: int = 0) -> dict:
    return {
        "id":               expense.id,
        "period_id":        expense.period_id,
        "date":             expense.date,
        "label":            expense.label,
        "amount":           expense.amount,
        "category_id":      expense.category_id,
        "category_name":    cat.name if cat else "Sin categoría",
        "category_type":    cat.type.value if cat else "",
        "obviable":         expense.obviable,
        "payment_status":   expense.payment_status.value,
        "review_status":    expense.review_status.value,
        "source":           expense.source.value,
        "observation":      expense.observation,
        "responsible_tag":  expense.responsible_tag,
        "created_at":       expense.created_at,
        "attachment_count": attachment_count,
        "shopping_list_id": expense.shopping_list_id,
        "items":            expense.items,
        "items_from_list":  expense.items_from_list,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year:  Optional[int] = Query(None),
    month: Optional[int] = Query(None),
):
    """Lista de egresos. Filtra por período (year+month → busca el period_id)."""
    stmt = (
        select(Expense)
        .where(Expense.user_id == current_user.id)
        .order_by(Expense.date.desc(), Expense.created_at.desc())
    )

    if year and month:
        # Buscar el período correspondiente al mes/año
        period = (await db.execute(
            select(Period).where(
                Period.user_id == current_user.id,
                Period.year == year,
                Period.month == month,
            )
        )).scalar_one_or_none()

        if period:
            stmt = stmt.where(Expense.period_id == period.id)
        else:
            return []  # No hay período para este mes → sin egresos
    elif year:
        # Año sin mes: traer todos los períodos del año
        period_ids = [
            p.id for p in (await db.execute(
                select(Period).where(
                    Period.user_id == current_user.id,
                    Period.year == year,
                )
            )).scalars().all()
        ]
        if not period_ids:
            return []
        stmt = stmt.where(Expense.period_id.in_(period_ids))

    expenses = (await db.execute(stmt)).scalars().all()

    # Batch load categorías para evitar N+1
    cat_ids = {e.category_id for e in expenses if e.category_id}
    cats: dict[uuid.UUID, Category] = {}
    if cat_ids:
        result = await db.execute(select(Category).where(Category.id.in_(cat_ids)))
        cats = {c.id: c for c in result.scalars().all()}

    # Batch count attachments
    att_counts: dict[uuid.UUID, int] = {}
    if expenses:
        exp_ids = [e.id for e in expenses]
        rows = (await db.execute(
            select(Attachment.expense_id, func.count(Attachment.id))
            .where(Attachment.expense_id.in_(exp_ids))
            .group_by(Attachment.expense_id)
        )).all()
        att_counts = {row[0]: row[1] for row in rows}

    return [_build_out(e, cats.get(e.category_id), att_counts.get(e.id, 0)) for e in expenses]


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(
    body: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Requiere período abierto, y la fecha debe caer dentro de él
    open_period = await _get_open_period(db, current_user.id)
    assert_date_in_period(body.date, open_period)

    # Validar categoría
    cat = (await db.execute(
        select(Category).where(
            Category.id == body.category_id,
            (Category.is_system.is_(True)) | (Category.user_id == current_user.id),
        )
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=400, detail="Categoría no válida")

    data = body.model_dump(exclude={"items"})
    if body.items:
        data["items"], data["amount"] = _items_snapshot(body.items)

    expense = Expense(
        user_id=current_user.id,
        period_id=open_period.id,
        source=TransactionSource.web,
        review_status=ReviewStatus.confirmado,
        **data,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return _build_out(expense, cat, 0)


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.user_id == current_user.id)
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")
    cat = (await db.execute(select(Category).where(Category.id == expense.category_id))).scalar_one_or_none()
    att_count = (await db.execute(
        select(func.count(Attachment.id)).where(Attachment.expense_id == expense.id)
    )).scalar() or 0
    return _build_out(expense, cat, att_count)


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: uuid.UUID,
    body: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.user_id == current_user.id)
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")

    await _assert_expense_editable(expense, db)

    if body.date is not None:
        assert_date_in_period(body.date, await _period_of(expense.period_id, db, current_user.id))

    if body.category_id and body.category_id != expense.category_id:
        cat = (await db.execute(
            select(Category).where(
                Category.id == body.category_id,
                (Category.is_system.is_(True)) | (Category.user_id == current_user.id),
            )
        )).scalar_one_or_none()
        if not cat:
            raise HTTPException(status_code=400, detail="Categoría no válida")

    # Con desglose, el total es siempre la suma de los ítems: no se cambia a mano.
    if body.items is None and expense.items and body.amount is not None and body.amount != expense.amount:
        raise HTTPException(status_code=400, detail="El monto de un egreso con desglose se calcula desde sus ítems")

    for field, value in body.model_dump(exclude_none=True, exclude={"items"}).items():
        setattr(expense, field, value)

    if body.items is not None:
        # El desglose de un egreso enviado desde una lista de compra es su snapshot: no se edita a mano.
        if expense.items_from_list:
            raise HTTPException(status_code=400, detail="El desglose de un egreso de lista de compra no se edita manualmente")
        if body.items:
            expense.items, expense.amount = _items_snapshot(body.items)
        else:
            expense.items = None

    if expense.review_status == ReviewStatus.confirmado and expense.amount == 0:
        raise HTTPException(status_code=400, detail="No se puede confirmar un egreso con monto $0")

    await db.commit()
    await db.refresh(expense)
    cat = (await db.execute(select(Category).where(Category.id == expense.category_id))).scalar_one_or_none()
    att_count = (await db.execute(
        select(func.count(Attachment.id)).where(Attachment.expense_id == expense.id)
    )).scalar() or 0
    return _build_out(expense, cat, att_count)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.user_id == current_user.id)
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")
    await _assert_expense_editable(expense, db)
    storage_keys = (await db.execute(
        select(Attachment.storage_key).where(Attachment.expense_id == expense.id)
    )).scalars().all()
    await db.delete(expense)
    await db.commit()
    await _delete_stored_files(storage_keys)


async def _delete_stored_files(keys: list[str]) -> None:
    """Borra de MinIO los archivos de adjuntos ya eliminados de la base (best-effort):
    sin esto quedaban huérfanos al eliminar un egreso."""
    from app import storage
    loop = asyncio.get_event_loop()
    for key in keys:
        try:
            await loop.run_in_executor(None, storage.delete_object, key)
        except Exception:
            logger.warning("No se pudo borrar el archivo %s", key)


# ─── Acciones masivas ─────────────────────────────────────────────────────────

class BulkAction(str, enum.Enum):
    confirm = "confirm"        # borrador → confirmado
    mark_paid = "mark_paid"    # confirmado pendiente → saldado
    delete = "delete"


class BulkRequest(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    action: BulkAction


class BulkFailure(BaseModel):
    id: uuid.UUID
    reason: str


class BulkResult(BaseModel):
    action: BulkAction
    done: list[uuid.UUID]
    failed: list[BulkFailure]


@router.post("/bulk", response_model=BulkResult)
async def bulk_expenses(
    body: BulkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aplica una acción a varios egresos. Cada uno se valida con las mismas reglas que
    la acción individual; los que no cumplen se omiten y se informan en `failed` con el
    motivo, sin bloquear al resto."""
    ids = list(dict.fromkeys(body.ids))
    expenses = {
        e.id: e for e in (await db.execute(
            select(Expense).where(Expense.id.in_(ids), Expense.user_id == current_user.id)
        )).scalars().all()
    }
    period_ids = {e.period_id for e in expenses.values() if e.period_id}
    periods = {
        p.id: p for p in (await db.execute(select(Period).where(Period.id.in_(period_ids)))).scalars().all()
    } if period_ids else {}

    done: list[uuid.UUID] = []
    failed: list[BulkFailure] = []
    to_delete: list[Expense] = []
    for expense_id in ids:
        expense = expenses.get(expense_id)
        if not expense:
            failed.append(BulkFailure(id=expense_id, reason="Egreso no encontrado"))
            continue
        period = periods.get(expense.period_id) if expense.period_id else None
        if period and period.status == PeriodStatus.cerrado:
            failed.append(BulkFailure(id=expense_id, reason="Su período está cerrado"))
            continue

        if body.action == BulkAction.confirm:
            if expense.review_status != ReviewStatus.borrador:
                failed.append(BulkFailure(id=expense_id, reason="No es un borrador"))
                continue
            if not expense.amount or expense.amount <= 0:
                failed.append(BulkFailure(id=expense_id, reason="Sin monto: complétalo antes de confirmar"))
                continue
            if period:
                first, last = period_bounds(period)
                if not (first <= expense.date <= last):
                    failed.append(BulkFailure(id=expense_id, reason="Fecha fuera del período abierto"))
                    continue
            expense.review_status = ReviewStatus.confirmado
        elif body.action == BulkAction.mark_paid:
            if expense.review_status == ReviewStatus.borrador:
                failed.append(BulkFailure(id=expense_id, reason="Es un borrador: confírmalo primero"))
                continue
            if expense.payment_status == PaymentStatus.saldado:
                failed.append(BulkFailure(id=expense_id, reason="Ya está pagado"))
                continue
            expense.payment_status = PaymentStatus.saldado
        else:
            to_delete.append(expense)
        done.append(expense_id)

    storage_keys: list[str] = []
    if to_delete:
        storage_keys = list((await db.execute(
            select(Attachment.storage_key).where(Attachment.expense_id.in_([e.id for e in to_delete]))
        )).scalars().all())
        for expense in to_delete:
            await db.delete(expense)
    await db.commit()
    await _delete_stored_files(storage_keys)
    return BulkResult(action=body.action, done=done, failed=failed)


# ─── OCR bajo demanda (formulario "Nuevo egreso") ─────────────────────────────

_OCR_ALLOWED_MIME = {"image/jpeg", "image/png"}
_OCR_MAX_BYTES = 20 * 1024 * 1024  # 20 MB


class OcrPreviewOut(BaseModel):
    ocr_raw_text: str
    amount: Optional[Decimal] = None
    category_id: Optional[uuid.UUID] = None
    category_name: Optional[str] = None


@router.post("/ocr-preview", response_model=OcrPreviewOut)
async def ocr_preview(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    OCR sincrónico para el modal "Analizando..." del formulario de nuevo egreso.
    No persiste nada (ni Expense ni Attachment) — solo intenta leer monto y
    categoría de la imagen para proponerlos en el formulario.
    """
    claimed_mime = file.content_type or ""
    if claimed_mime not in _OCR_ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Solo se puede analizar: {', '.join(sorted(_OCR_ALLOWED_MIME))}",
        )

    content = await file.read()
    if len(content) > _OCR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera el límite de 20 MB")

    loop = asyncio.get_event_loop()
    try:
        text = await loop.run_in_executor(None, run_ocr, content)
    except Exception:
        raise HTTPException(status_code=422, detail="No se pudo procesar la imagen")

    amount = guess_amount(text)

    categories = (await db.execute(
        select(Category).where(
            (Category.is_system.is_(True)) | (Category.user_id == current_user.id)
        )
    )).scalars().all()
    memory = (await db.execute(
        select(MerchantCategoryMemory).where(MerchantCategoryMemory.user_id == current_user.id)
    )).scalars().all()
    category = guess_category(text, categories, memory)

    return OcrPreviewOut(
        ocr_raw_text=text,
        amount=amount,
        category_id=category.id if category else None,
        category_name=category.name if category else None,
    )

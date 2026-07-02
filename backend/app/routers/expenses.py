"""
Egresos del usuario autenticado — /api/v1/expenses

Regla de períodos:
  - Todo egreso se vincula al período ABIERTO al momento de su creación (period_id).
  - La fecha del egreso es solo metadata informativa (ej: pago de sueldo el 30/jun).
  - Un egreso solo puede modificarse/eliminarse si su período está abierto.
  - Si no existe período abierto, no se puede crear egresos.
"""
import uuid
from datetime import datetime
from datetime import date as date_cls
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.transaction import Expense, Attachment, PaymentStatus, ReviewStatus, TransactionSource
from app.models.catalog import Category
from app.models.period import Period, PeriodStatus

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

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    date: date_cls
    label: str
    category_id: uuid.UUID
    amount: Decimal
    obviable: bool = False
    payment_status: PaymentStatus = PaymentStatus.pendiente
    observation: Optional[str] = None
    responsible_tag: Optional[str] = None


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


# ─── Helpers ─────────────────────────────────────────────────────────────────

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
    # Requiere período abierto
    open_period = await _get_open_period(db, current_user.id)

    # Validar categoría
    cat = (await db.execute(
        select(Category).where(
            Category.id == body.category_id,
            (Category.is_system.is_(True)) | (Category.user_id == current_user.id),
        )
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=400, detail="Categoría no válida")

    expense = Expense(
        user_id=current_user.id,
        period_id=open_period.id,
        source=TransactionSource.web,
        review_status=ReviewStatus.confirmado,
        **body.model_dump(),
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

    if body.category_id and body.category_id != expense.category_id:
        cat = (await db.execute(
            select(Category).where(
                Category.id == body.category_id,
                (Category.is_system.is_(True)) | (Category.user_id == current_user.id),
            )
        )).scalar_one_or_none()
        if not cat:
            raise HTTPException(status_code=400, detail="Categoría no válida")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(expense, field, value)

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
    await db.delete(expense)
    await db.commit()

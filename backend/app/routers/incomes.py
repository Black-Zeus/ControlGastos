"""
Ingresos del usuario autenticado — /api/v1/incomes

Regla de períodos:
  - Todo ingreso se vincula al período ABIERTO al momento de su creación.
  - Un ingreso solo puede modificarse/eliminarse si su período está abierto.
  - Si no existe período abierto, no se puede crear ingresos.
"""
import uuid
from datetime import datetime
from datetime import date as date_cls
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.transaction import Income, IncomePaymentStatus
from app.models.period import Period, PeriodStatus
from app.models.catalog import IncomeType

router = APIRouter(prefix="/incomes", tags=["incomes"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class IncomeOut(BaseModel):
    id: uuid.UUID
    period_id: Optional[uuid.UUID]
    date: date_cls
    label: str
    amount: Decimal
    payment_status: str
    income_type_id: uuid.UUID
    income_type_name: str
    responsible_tag: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class IncomeCreate(BaseModel):
    date: date_cls
    label: str
    income_type_id: uuid.UUID
    amount: Decimal
    payment_status: str = "recibido"
    responsible_tag: Optional[str] = None


class IncomeUpdate(BaseModel):
    date: Optional[date_cls] = None
    label: Optional[str] = None
    income_type_id: Optional[uuid.UUID] = None
    amount: Optional[Decimal] = None
    payment_status: Optional[str] = None
    responsible_tag: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_open_period(db: AsyncSession, user_id: uuid.UUID) -> Period:
    period = (await db.execute(
        select(Period).where(
            Period.user_id == user_id,
            Period.status == PeriodStatus.abierto,
        )
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(
            status_code=409,
            detail="No hay período abierto. Abre un período antes de registrar ingresos.",
        )
    return period


async def _assert_income_editable(income: Income, db: AsyncSession) -> None:
    if income.period_id is None:
        return
    period = (await db.execute(
        select(Period).where(Period.id == income.period_id)
    )).scalar_one_or_none()
    if period and period.status == PeriodStatus.cerrado:
        raise HTTPException(
            status_code=409,
            detail="El período de este ingreso está cerrado. No se pueden hacer cambios.",
        )


def _build_out(income: Income, income_type: Optional[IncomeType]) -> dict:
    return {
        "id": income.id,
        "period_id": income.period_id,
        "date": income.date,
        "label": income.label,
        "amount": income.amount,
        "payment_status": income.payment_status.value if hasattr(income.payment_status, 'value') else str(income.payment_status),
        "income_type_id": income.income_type_id,
        "income_type_name": income_type.name if income_type else "Sin tipo",
        "responsible_tag": income.responsible_tag,
        "created_at": income.created_at,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[IncomeOut])
async def list_incomes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
):
    stmt = (
        select(Income)
        .where(Income.user_id == current_user.id)
        .order_by(Income.date.desc(), Income.created_at.desc())
    )

    if year and month:
        period = (await db.execute(
            select(Period).where(
                Period.user_id == current_user.id,
                Period.year == year,
                Period.month == month,
            )
        )).scalar_one_or_none()

        if period:
            stmt = stmt.where(Income.period_id == period.id)
        else:
            return []
    elif year:
        period_ids = [p.id for p in (await db.execute(
            select(Period).where(
                Period.user_id == current_user.id,
                Period.year == year,
            )
        )).scalars().all()]
        if not period_ids:
            return []
        stmt = stmt.where(Income.period_id.in_(period_ids))

    incomes = (await db.execute(stmt)).scalars().all()
    type_ids = {i.income_type_id for i in incomes if i.income_type_id}
    types: dict[uuid.UUID, IncomeType] = {}
    if type_ids:
        result = await db.execute(select(IncomeType).where(IncomeType.id.in_(type_ids)))
        types = {t.id: t for t in result.scalars().all()}

    return [_build_out(i, types.get(i.income_type_id)) for i in incomes]


@router.post("", response_model=IncomeOut, status_code=status.HTTP_201_CREATED)
async def create_income(
    body: IncomeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    open_period = await _get_open_period(db, current_user.id)

    income_type = (await db.execute(
        select(IncomeType).where(
            IncomeType.id == body.income_type_id,
            (IncomeType.is_system.is_(True)) | (IncomeType.user_id == current_user.id),
        )
    )).scalar_one_or_none()
    if not income_type:
        raise HTTPException(status_code=400, detail="Tipo de ingreso no válido")

    income = Income(
        user_id=current_user.id,
        period_id=open_period.id,
        **body.model_dump(),
    )
    db.add(income)
    await db.commit()
    await db.refresh(income)
    return _build_out(income, income_type)


@router.get("/{income_id}", response_model=IncomeOut)
async def get_income(
    income_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income = (await db.execute(
        select(Income).where(Income.id == income_id, Income.user_id == current_user.id)
    )).scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")

    income_type = (await db.execute(select(IncomeType).where(IncomeType.id == income.income_type_id))).scalar_one_or_none()
    return _build_out(income, income_type)


@router.patch("/{income_id}", response_model=IncomeOut)
async def update_income(
    income_id: uuid.UUID,
    body: IncomeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income = (await db.execute(
        select(Income).where(Income.id == income_id, Income.user_id == current_user.id)
    )).scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")

    await _assert_income_editable(income, db)

    if body.income_type_id and body.income_type_id != income.income_type_id:
        income_type = (await db.execute(
            select(IncomeType).where(
                IncomeType.id == body.income_type_id,
                (IncomeType.is_system.is_(True)) | (IncomeType.user_id == current_user.id),
            )
        )).scalar_one_or_none()
        if not income_type:
            raise HTTPException(status_code=400, detail="Tipo de ingreso no válido")
    else:
        income_type = (await db.execute(select(IncomeType).where(IncomeType.id == income.income_type_id))).scalar_one_or_none()

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(income, field, value)

    await db.commit()
    await db.refresh(income)
    if not income_type:
        income_type = (await db.execute(select(IncomeType).where(IncomeType.id == income.income_type_id))).scalar_one_or_none()
    return _build_out(income, income_type)


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_income(
    income_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income = (await db.execute(
        select(Income).where(Income.id == income_id, Income.user_id == current_user.id)
    )).scalar_one_or_none()
    if not income:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")

    await _assert_income_editable(income, db)
    await db.delete(income)
    await db.commit()

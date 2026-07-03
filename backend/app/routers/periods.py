"""
Períodos contables del usuario — /api/v1/periods
"""
import asyncio
import base64
import logging
import uuid
import calendar
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from decimal import Decimal
from typing import Optional, Literal
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, field_validator

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.period import Period, PeriodStatus
from app.models.transaction import (
    Expense, Income, PaymentStatus, IncomePaymentStatus,
    ReviewStatus, TransactionSource,
)
from app.models.catalog import Category, CategoryType
from app import storage
from app.services import pdf_report, email as email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/periods", tags=["periods"])

_MONTHS_ES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PeriodOut(BaseModel):
    id: uuid.UUID
    year: int
    month: int
    status: str
    notes: Optional[str]
    total_incomes: Optional[Decimal]
    total_expenses: Optional[Decimal]
    balance: Optional[Decimal]
    report_key: Optional[str] = None
    opened_at: datetime
    closed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class PeriodOpenOut(PeriodOut):
    carry_forward_count: int = 0


class PeriodCreate(BaseModel):
    year: int
    month: int

    @field_validator("month")
    @classmethod
    def valid_month(cls, v: int) -> int:
        if not 1 <= v <= 12:
            raise ValueError("El mes debe estar entre 1 y 12")
        return v

    @field_validator("year")
    @classmethod
    def valid_year(cls, v: int) -> int:
        if not 2000 <= v <= 2100:
            raise ValueError("Año no válido")
        return v


class PeriodClose(BaseModel):
    notes: Optional[str] = None
    handle_pending: Literal['carry', 'delete'] = 'carry'


# ─── Helper ──────────────────────────────────────────────────────────────────

async def _get_period_totals(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> tuple[Decimal, Decimal]:
    first_day = date(year, month, 1)
    last_day  = date(year, month, calendar.monthrange(year, month)[1])

    inc_result = await db.execute(
        select(func.coalesce(func.sum(Income.amount), 0)).where(
            Income.user_id == user_id,
            Income.date >= first_day,
            Income.date <= last_day,
        )
    )
    exp_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.user_id == user_id,
            Expense.date >= first_day,
            Expense.date <= last_day,
        )
    )
    return Decimal(str(inc_result.scalar() or 0)), Decimal(str(exp_result.scalar() or 0))


def _fmt_currency(amount: Decimal, currency: str) -> str:
    n = float(amount)
    sign = '-' if n < 0 else ''
    s = f'{abs(n):,.0f}'.replace(',', '.')
    return f'{sign}{s} {currency}'


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PeriodOut])
async def list_periods(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Period)
        .where(Period.user_id == current_user.id)
        .order_by(Period.year.desc(), Period.month.desc())
    )
    return result.scalars().all()


@router.get("/current", response_model=PeriodOut)
async def get_current_period(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Period).where(
            Period.user_id == current_user.id,
            Period.status == PeriodStatus.abierto,
        )
    )
    period = result.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="No hay período abierto")
    return period


@router.post("", response_model=PeriodOpenOut, status_code=status.HTTP_201_CREATED)
async def open_period(
    body: PeriodCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    open_period = (await db.execute(
        select(Period).where(
            Period.user_id == current_user.id,
            Period.status == PeriodStatus.abierto,
        )
    )).scalar_one_or_none()
    if open_period:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un período abierto ({open_period.year}/{open_period.month:02d}). Ciérralo antes de abrir uno nuevo."
        )

    existing = (await db.execute(
        select(Period).where(
            Period.user_id == current_user.id,
            Period.year == body.year,
            Period.month == body.month,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un período para {body.year}/{body.month:02d}"
        )

    # Validar orden secuencial: el nuevo período debe ser el inmediato siguiente al último existente
    latest_any = (await db.execute(
        select(Period)
        .where(Period.user_id == current_user.id)
        .order_by(Period.year.desc(), Period.month.desc())
        .limit(1)
    )).scalar_one_or_none()

    if latest_any:
        exp_year  = latest_any.year + 1 if latest_any.month == 12 else latest_any.year
        exp_month = 1                   if latest_any.month == 12 else latest_any.month + 1
        if body.year != exp_year or body.month != exp_month:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Los períodos deben abrirse en orden. "
                    f"El siguiente es {_MONTHS_ES[exp_month]} {exp_year} ({exp_year}/{exp_month:02d})."
                ),
            )

    period = Period(
        user_id=current_user.id,
        year=body.year,
        month=body.month,
        status=PeriodStatus.abierto,
    )
    db.add(period)
    await db.flush()

    carry_count = 0
    last_closed = (await db.execute(
        select(Period).where(
            Period.user_id == current_user.id,
            Period.status == PeriodStatus.cerrado,
        ).order_by(Period.year.desc(), Period.month.desc())
        .limit(1)
    )).scalar_one_or_none()

    if last_closed:
        first_day = date(body.year, body.month, 1)

        # Copiar: egresos recurrentes + egresos marcados carry_forward
        expenses_to_carry = (await db.execute(
            select(Expense)
            .outerjoin(Category, Expense.category_id == Category.id)
            .where(
                Expense.period_id == last_closed.id,
                or_(
                    Category.type == CategoryType.recurrente,
                    Expense.carry_forward.is_(True),
                ),
            )
        )).scalars().all()

        seen_expense_ids = set()
        for e in expenses_to_carry:
            if e.id in seen_expense_ids:
                continue
            seen_expense_ids.add(e.id)
            db.add(Expense(
                user_id=current_user.id,
                period_id=period.id,
                date=first_day,
                label=e.label,
                category_id=e.category_id,
                amount=e.amount,
                obviable=e.obviable,
                payment_status=PaymentStatus.pendiente,
                review_status=ReviewStatus.borrador,
                source=TransactionSource.web,
                observation=e.observation,
                responsible_tag=e.responsible_tag,
            ))
            carry_count += 1

        # Copiar ingresos marcados carry_forward
        incomes_to_carry = (await db.execute(
            select(Income).where(
                Income.period_id == last_closed.id,
                Income.carry_forward.is_(True),
            )
        )).scalars().all()

        for i in incomes_to_carry:
            db.add(Income(
                user_id=current_user.id,
                period_id=period.id,
                date=first_day,
                label=i.label,
                income_type_id=i.income_type_id,
                amount=i.amount,
                payment_status=IncomePaymentStatus.pendiente,
                responsible_tag=i.responsible_tag,
            ))
            carry_count += 1

    await db.commit()
    await db.refresh(period)

    result = PeriodOpenOut.model_validate(period)
    result.carry_forward_count = carry_count
    return result


@router.patch("/{period_id}/close", response_model=PeriodOut)
async def close_period(
    period_id: uuid.UUID,
    body: PeriodClose,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    period = (await db.execute(
        select(Period).where(
            Period.id == period_id,
            Period.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")
    if period.status == PeriodStatus.cerrado:
        raise HTTPException(status_code=409, detail="El período ya está cerrado")

    # Manejar registros pendientes antes de calcular totales
    pending_expenses = (await db.execute(
        select(Expense).where(
            Expense.period_id == period_id,
            Expense.payment_status == PaymentStatus.pendiente,
        )
    )).scalars().all()

    pending_incomes = (await db.execute(
        select(Income).where(
            Income.period_id == period_id,
            Income.payment_status == IncomePaymentStatus.pendiente,
        )
    )).scalars().all()

    if body.handle_pending == 'carry':
        for e in pending_expenses:
            e.carry_forward = True
        for i in pending_incomes:
            i.carry_forward = True
    elif body.handle_pending == 'delete':
        for e in pending_expenses:
            await db.delete(e)
        for i in pending_incomes:
            await db.delete(i)
        await db.flush()

    # Calcular totales (después de manejar pendientes)
    total_inc, total_exp = await _get_period_totals(
        db, current_user.id, period.year, period.month
    )
    balance = total_inc - total_exp

    period.status       = PeriodStatus.cerrado
    period.closed_at    = datetime.utcnow()
    period.notes        = body.notes
    period.total_incomes  = total_inc
    period.total_expenses = total_exp
    period.balance      = balance

    await db.commit()
    await db.refresh(period)

    # Cargar avatar del usuario (para el PDF)
    avatar_b64 = None
    avatar_mime = 'image/jpeg'
    if current_user.avatar_key:
        try:
            loop = asyncio.get_event_loop()
            avatar_bytes, avatar_mime = await loop.run_in_executor(
                None, storage.download_bytes, current_user.avatar_key
            )
            avatar_b64 = base64.b64encode(avatar_bytes).decode()
        except Exception as exc:
            logger.warning("No se pudo cargar avatar para PDF: %s", exc)

    # Generar PDF de forma sincrónica
    try:
        expenses = (await db.execute(
            select(Expense)
            .options(selectinload(Expense.category))
            .where(Expense.period_id == period_id)
            .order_by(Expense.date, Expense.label)
        )).scalars().all()

        incomes = (await db.execute(
            select(Income)
            .options(selectinload(Income.income_type))
            .where(Income.period_id == period_id)
            .order_by(Income.date, Income.label)
        )).scalars().all()

        # Convertir closed_at a la zona horaria del usuario para el PDF
        closed_at_local = period.closed_at
        if closed_at_local is not None:
            try:
                tz = ZoneInfo(current_user.timezone or 'UTC')
                closed_at_local = closed_at_local.replace(tzinfo=timezone.utc).astimezone(tz)
            except ZoneInfoNotFoundError:
                pass

        html_content = pdf_report.build_report_html(
            year=period.year,
            month=period.month,
            currency=current_user.currency,
            total_incomes=total_inc,
            total_expenses=total_exp,
            balance=balance,
            expenses=expenses,
            incomes=incomes,
            user_name=current_user.name,
            closed_at=closed_at_local,
            avatar_b64=avatar_b64,
            avatar_mime=avatar_mime,
            notes=period.notes,
        )
        pdf_bytes = await pdf_report.generate_pdf(html_content)

        report_key = f"reports/{current_user.id}/{period_id}/reporte_{period.year}_{period.month:02d}.pdf"
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, storage.upload_bytes, pdf_bytes, report_key, "application/pdf"
        )

        period.report_key = report_key
        await db.commit()
        await db.refresh(period)

        background_tasks.add_task(
            _send_period_report_email,
            user_email=current_user.email,
            user_name=current_user.name,
            year=period.year,
            month=period.month,
            currency=current_user.currency,
            pdf_bytes=pdf_bytes,
            total_inc=total_inc,
            total_exp=total_exp,
            balance=balance,
        )
        logger.info("PDF de período %s/%s generado", period.year, period.month)

    except Exception as exc:
        logger.error("Error generando PDF de período %s/%s: %s", period.year, period.month, exc)

    return period


@router.patch("/{period_id}/reopen", response_model=PeriodOut)
async def reopen_period(
    period_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reabre el período cerrado más reciente, siempre que no haya otro abierto."""
    period = (await db.execute(
        select(Period).where(
            Period.id == period_id,
            Period.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")
    if period.status == PeriodStatus.abierto:
        raise HTTPException(status_code=409, detail="El período ya está abierto")

    open_period = (await db.execute(
        select(Period).where(
            Period.user_id == current_user.id,
            Period.status == PeriodStatus.abierto,
        )
    )).scalar_one_or_none()
    if open_period:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un período abierto ({open_period.year}/{open_period.month:02d}). Ciérralo antes de reabrir este."
        )

    last_closed = (await db.execute(
        select(Period).where(
            Period.user_id == current_user.id,
            Period.status == PeriodStatus.cerrado,
        ).order_by(Period.year.desc(), Period.month.desc())
        .limit(1)
    )).scalar_one_or_none()

    if not last_closed or last_closed.id != period_id:
        raise HTTPException(
            status_code=409,
            detail="Solo se puede reabrir el período cerrado más reciente"
        )

    old_report_key = period.report_key

    # Limpiar carry_forward de los registros del período
    for e in (await db.execute(
        select(Expense).where(Expense.period_id == period_id, Expense.carry_forward.is_(True))
    )).scalars().all():
        e.carry_forward = False

    for i in (await db.execute(
        select(Income).where(Income.period_id == period_id, Income.carry_forward.is_(True))
    )).scalars().all():
        i.carry_forward = False

    period.status         = PeriodStatus.abierto
    period.closed_at      = None
    period.total_incomes  = None
    period.total_expenses = None
    period.balance        = None
    period.report_key     = None
    period.notes          = None

    await db.commit()
    await db.refresh(period)

    if old_report_key:
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, storage.delete_object, old_report_key)
        except Exception as exc:
            logger.warning("No se pudo eliminar reporte de MinIO: %s", exc)

    background_tasks.add_task(
        _send_period_reopened_email,
        user_email=current_user.email,
        user_name=current_user.name,
        year=period.year,
        month=period.month,
    )

    return period


# ─── Tareas de background ─────────────────────────────────────────────────────

async def _send_period_report_email(
    *,
    user_email: str,
    user_name: str,
    year: int,
    month: int,
    currency: str,
    pdf_bytes: bytes,
    total_inc: Decimal,
    total_exp: Decimal,
    balance: Decimal,
) -> None:
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await email_service.send_period_report(
            db,
            to_email=user_email,
            user_name=user_name,
            year=year,
            month=month,
            pdf_bytes=pdf_bytes,
            total_incomes_fmt=_fmt_currency(total_inc, currency),
            total_expenses_fmt=_fmt_currency(total_exp, currency),
            balance_fmt=_fmt_currency(balance, currency),
            balance_positive=balance >= 0,
        )


async def _send_period_reopened_email(
    *, user_email: str, user_name: str, year: int, month: int
) -> None:
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await email_service.send_period_reopened(
            db,
            to_email=user_email,
            user_name=user_name,
            year=year,
            month=month,
        )


# ─── Reporte ─────────────────────────────────────────────────────────────────

@router.get("/{period_id}/report")
async def download_report(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    period = (await db.execute(
        select(Period).where(
            Period.id == period_id,
            Period.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")
    if not period.report_key:
        raise HTTPException(status_code=404, detail="Reporte no disponible aún")

    loop = asyncio.get_event_loop()
    pdf_bytes, _ = await loop.run_in_executor(None, storage.download_bytes, period.report_key)
    filename = f"reporte_{period.year}_{period.month:02d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{period_id}", response_model=PeriodOut)
async def get_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    period = (await db.execute(
        select(Period).where(
            Period.id == period_id,
            Period.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")
    return period


@router.delete("/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    period = (await db.execute(
        select(Period).where(Period.id == period_id, Period.user_id == current_user.id)
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    # Solo el período más reciente puede eliminarse
    last = (await db.execute(
        select(Period)
        .where(Period.user_id == current_user.id)
        .order_by(Period.year.desc(), Period.month.desc())
        .limit(1)
    )).scalar_one_or_none()
    if not last or last.id != period_id:
        raise HTTPException(status_code=400, detail="Solo puedes eliminar el período más reciente")

    # No puede ser más antiguo que el mes anterior
    today = date.today()
    period_date = date(period.year, period.month, 1)
    if today.month == 1:
        min_allowed = date(today.year - 1, 12, 1)
    else:
        min_allowed = date(today.year, today.month - 1, 1)
    if period_date < min_allowed:
        raise HTTPException(
            status_code=400,
            detail="Solo puedes eliminar períodos del mes anterior o actual",
        )

    await db.delete(period)
    await db.commit()

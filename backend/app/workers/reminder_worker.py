"""
Worker de recordatorios diarios.

Estrategia de scheduling:
  - Un cron APScheduler se dispara a las 00:05 cada noche.
  - Lee todos los usuarios activos con receive_reminders=True y crea un job
    de tipo 'date' por usuario, programado para HOY a su reminder_hour.
  - Al arrancar el worker también programa los jobs pendientes del día actual
    (para tolerar reinicios).
  - Cada job individual llama a _process_user(user_id), que calcula "mañana"
    en la zona horaria del usuario y envía el email si hay compromisos pendientes.

El admin puede forzar un envío inmediato vía run_daily_reminder() (ignora horas).
"""
import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.settings import AppSetting
from app.models.transaction import Expense, Income, PaymentStatus, IncomePaymentStatus
from app.models.user import User
from app.services import email as email_svc

log = logging.getLogger(__name__)

_ZERO_DECIMAL_CURRENCIES = frozenset(
    {"CLP", "CRC", "COP", "PYG", "JPY", "KRW", "VND", "IDR"}
)

# Minutos de gracia: si el worker se reinicia y la hora del usuario pasó hace
# menos de GRACE_MINUTES, enviamos igual (corremos el job de inmediato).
_GRACE_MINUTES = 10


def _fmt_amount(amount: Decimal, currency: str) -> str:
    if currency.upper() in _ZERO_DECIMAL_CURRENCIES:
        # Separador de miles con punto (formato latinoamericano: 1.000.000)
        return f"{currency} {int(amount):,}".replace(",", ".")
    # Formato con decimales: miles con punto, decimal con coma (1.234,56)
    formatted = f"{amount:,.2f}"
    integer_part, decimal_part = formatted.split(".")
    return f"{currency} {integer_part.replace(',', '.')},{decimal_part}"


async def _load_reminder_enabled() -> bool:
    """Lee reminder_enabled de app_settings. Devuelve True si la tabla no existe aún."""
    try:
        async with AsyncSessionLocal() as db:
            row = (await db.execute(
                select(AppSetting).where(AppSetting.key == "reminder_enabled")
            )).scalar_one_or_none()
        if row is None:
            return True
        return (row.value or "true").lower() not in ("false", "0", "no")
    except Exception as exc:
        log.warning("No se pudo leer app_settings, asumiendo enabled=True: %s", exc)
        return True


async def schedule_today_reminders(scheduler: AsyncIOScheduler) -> None:
    """
    Crea un job 'date' por cada usuario elegible, programado para HOY
    a su reminder_hour configurado. Llamado al arrancar y cada medianoche.
    """
    enabled = await _load_reminder_enabled()
    if not enabled:
        log.info("Recordatorios globalmente desactivados — no se programan jobs")
        return

    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(User.id, User.timezone, User.reminder_hour)
                .where(User.is_active.is_(True), User.receive_reminders.is_(True))
            )).all()
    except Exception as exc:
        log.error("Error consultando usuarios para programar recordatorios: %s", exc)
        return

    today = date.today()
    scheduled = 0

    for user_id, tz_str, reminder_hour in rows:
        hour = reminder_hour if reminder_hour is not None else 8

        try:
            user_tz = ZoneInfo(tz_str or "America/Santiago")
        except ZoneInfoNotFoundError:
            user_tz = ZoneInfo("America/Santiago")

        now_user = datetime.now(user_tz)
        send_dt = datetime(today.year, today.month, today.day, hour, 0, 0, tzinfo=user_tz)

        # Calcular cuándo ejecutar: en el futuro, o inmediatamente si acabó de pasar
        grace_cutoff = now_user - timedelta(minutes=_GRACE_MINUTES)
        if send_dt < grace_cutoff:
            log.debug(
                "Hora de envío para usuario %s (%02d:00) ya pasó (>%d min), omitiendo",
                user_id, hour, _GRACE_MINUTES,
            )
            continue

        run_date = send_dt if send_dt > now_user else now_user + timedelta(seconds=5)

        job_id = f"reminder_{user_id}_{today}"
        scheduler.add_job(
            _process_user,
            'date',
            run_date=run_date,
            args=[user_id],
            id=job_id,
            replace_existing=True,
        )
        scheduled += 1

    log.info("Programados %d recordatorios para hoy %s", scheduled, today)


async def _process_user(user_id: uuid.UUID) -> bool:
    """Consulta pendientes para mañana y envía email si los hay. Retorna True si se envió."""
    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()

    if not user or not user.is_active or not getattr(user, 'receive_reminders', True):
        return False

    try:
        tz = ZoneInfo(user.timezone or "America/Santiago")
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("America/Santiago")

    tomorrow: date = (datetime.now(tz) + timedelta(days=1)).date()

    async with AsyncSessionLocal() as db:
        expenses = (await db.execute(
            select(Expense)
            .where(
                Expense.user_id == user.id,
                Expense.payment_status == PaymentStatus.pendiente,
                Expense.date == tomorrow,
            )
            .options(selectinload(Expense.category))
            .order_by(Expense.amount.desc())
        )).scalars().all()

        incomes = (await db.execute(
            select(Income)
            .where(
                Income.user_id == user.id,
                Income.payment_status == IncomePaymentStatus.pendiente,
                Income.date == tomorrow,
            )
            .options(selectinload(Income.income_type))
            .order_by(Income.amount.desc())
        )).scalars().all()

        if not expenses and not incomes:
            return False

        log.info(
            "Usuario %s: %d egresos, %d ingresos pendientes para %s",
            user.email, len(expenses), len(incomes), tomorrow,
        )

        currency = user.currency or "USD"

        expense_items = [
            {
                "label": e.label,
                "category": e.category.name if e.category else "—",
                "amount": _fmt_amount(e.amount, currency),
                "responsible": e.responsible_tag,
            }
            for e in expenses
        ]
        income_items = [
            {
                "label": i.label,
                "income_type": i.income_type.name if i.income_type else "—",
                "amount": _fmt_amount(i.amount, currency),
                "responsible": i.responsible_tag,
            }
            for i in incomes
        ]

        total_exp = _fmt_amount(sum(e.amount for e in expenses), currency) if expenses else None
        total_inc = _fmt_amount(sum(i.amount for i in incomes), currency) if incomes else None

        await email_svc.send_daily_reminder(
            db,
            to_email=user.email,
            user_name=user.name,
            tomorrow=tomorrow,
            expense_items=expense_items,
            income_items=income_items,
            total_expenses=total_exp,
            total_incomes=total_inc,
        )

    return True


async def run_daily_reminder() -> None:
    """
    Ejecución inmediata para todos los usuarios elegibles — usada por el admin
    para forzar un envío de prueba. Ignora reminder_hour.
    """
    enabled = await _load_reminder_enabled()
    if not enabled:
        log.info("Recordatorios desactivados — omitiendo ejecución forzada")
        return

    log.info("Iniciando recordatorio diario forzado...")

    try:
        async with AsyncSessionLocal() as db:
            users = (await db.execute(
                select(User).where(
                    User.is_active.is_(True),
                    User.receive_reminders.is_(True),
                )
            )).scalars().all()
    except Exception as exc:
        log.error("Error consultando usuarios: %s", exc)
        return

    sent = 0
    for user in users:
        try:
            if await _process_user(user.id):
                sent += 1
        except Exception as exc:
            log.warning("Error procesando recordatorio para usuario %s: %s", user.id, exc)

    log.info("Recordatorio forzado completado: %d emails enviados de %d usuarios elegibles", sent, len(users))


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    log.info("Reminder worker iniciado")

    scheduler = AsyncIOScheduler(timezone="America/Santiago")

    # Cron nocturno: a las 00:05 programa los jobs del día para cada usuario
    scheduler.add_job(
        schedule_today_reminders,
        'cron',
        hour=0, minute=5,
        id='nightly_scheduler',
        args=[scheduler],
    )
    scheduler.start()

    # Al arrancar, programar jobs pendientes del día actual (tolerancia a reinicios)
    await schedule_today_reminders(scheduler)

    log.info("Scheduler iniciado — cron nocturno activo, %d jobs programados hoy", len(scheduler.get_jobs()) - 1)

    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit):
        log.info("Reminder worker detenido")
        scheduler.shutdown()


if __name__ == "__main__":
    asyncio.run(main())

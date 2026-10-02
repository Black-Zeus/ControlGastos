"""
Regla de período: todo registro (egreso, ingreso, lista de compra y su envío) solo
acepta fechas dentro del período abierto — nunca a futuro ni en el pasado.
"""
import calendar
from datetime import date

from fastapi import HTTPException, status

from app.models.period import Period

_MONTHS = [
    '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]


def period_bounds(period: Period) -> tuple[date, date]:
    last_day = calendar.monthrange(period.year, period.month)[1]
    return date(period.year, period.month, 1), date(period.year, period.month, last_day)


def assert_date_in_period(value: date, period: Period) -> None:
    first, last = period_bounds(period)
    if not (first <= value <= last):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La fecha debe estar dentro del período abierto ({_MONTHS[period.month]} {period.year}: "
                   f"{first:%d/%m/%Y} al {last:%d/%m/%Y})",
        )


def clamp_to_period(value: date, period: Period) -> date:
    """Ajusta una fecha al rango del período (para fechas automáticas, p. ej. 'hoy')."""
    first, last = period_bounds(period)
    return min(max(value, first), last)

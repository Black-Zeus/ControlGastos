"""
Endpoints de exportación PDF para los reportes analíticos.
No persiste en MinIO; genera y devuelve el PDF directamente.
"""
import asyncio
import base64
import logging
import re
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.services import pdf_analytics
from app.services.pdf_report import generate_pdf
from app import storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


# ─── Schemas de entrada ────────────────────────────────────────────────────────

class KpiRow(BaseModel):
    label: str
    va: float
    vb: float
    delta: float
    delta_pct: float | None = None
    higher_is_better: bool = True


class CatComp(BaseModel):
    name: str
    total_a: float
    total_b: float
    delta: float


class ComparacionPayload(BaseModel):
    label_a: str
    label_b: str
    kpi_rows: list[KpiRow]
    categories: list[CatComp]
    chart_svg: str | None = None


class PeriodMetrics(BaseModel):
    label: str
    status: str
    totalIngresos: float
    egresosSaldados: float
    egresosPendientes: float
    egresosReservados: float
    dineroLibre: float
    libreSoloPagado: float


class TotalsMetrics(BaseModel):
    totalIngresos: float
    egresosSaldados: float
    egresosPendientes: float
    egresosReservados: float
    dineroLibre: float
    libreSoloPagado: float


class TendenciaPayload(BaseModel):
    mode_label: str
    periods: list[PeriodMetrics]
    totals: TotalsMetrics
    chart_svg: str | None = None


class CatRow(BaseModel):
    name: str
    values: list[float]
    total: float


class CategoriasPayload(BaseModel):
    mode_label: str
    period_labels: list[str]
    table: list[CatRow]
    period_totals: list[float]
    grand_total: float
    chart_cats: list[str]
    chart_svg: str | None = None


# ─── Helper: cargar avatar ─────────────────────────────────────────────────────

async def _load_avatar(user: User) -> tuple[str | None, str]:
    if not user.avatar_key:
        return None, 'image/jpeg'
    try:
        loop = asyncio.get_event_loop()
        raw, mime = await loop.run_in_executor(None, storage.download_bytes, user.avatar_key)
        return base64.b64encode(raw).decode(), mime or 'image/jpeg'
    except Exception as exc:
        logger.warning("No se pudo cargar avatar para reporte PDF: %s", exc)
        return None, 'image/jpeg'


def _safe_filename(s: str) -> str:
    nfd = unicodedata.normalize('NFD', s)
    ascii_only = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^\w\-]', '_', ascii_only)


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    import urllib.parse
    encoded = urllib.parse.quote(filename, safe='')
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={'Content-Disposition': f"attachment; filename*=UTF-8''{encoded}"},
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post('/pdf/comparacion')
async def export_comparacion(
    payload: ComparacionPayload,
    current_user: User = Depends(get_current_user),
) -> Response:
    avatar_b64, avatar_mime = await _load_avatar(current_user)
    html = pdf_analytics.build_comparacion_html(
        user_name=current_user.name,
        currency=current_user.currency,
        label_a=payload.label_a,
        label_b=payload.label_b,
        kpi_rows=[r.model_dump() for r in payload.kpi_rows],
        categories=[c.model_dump() for c in payload.categories],
        avatar_b64=avatar_b64,
        avatar_mime=avatar_mime,
        chart_svg=payload.chart_svg,
    )
    pdf_bytes = await generate_pdf(html)
    fname = f'Comparacion_{_safe_filename(payload.label_a)}_vs_{_safe_filename(payload.label_b)}.pdf'
    return _pdf_response(pdf_bytes, fname)


@router.post('/pdf/tendencia')
async def export_tendencia(
    payload: TendenciaPayload,
    current_user: User = Depends(get_current_user),
) -> Response:
    avatar_b64, avatar_mime = await _load_avatar(current_user)
    html = pdf_analytics.build_tendencia_html(
        user_name=current_user.name,
        currency=current_user.currency,
        mode_label=payload.mode_label,
        periods=[p.model_dump() for p in payload.periods],
        totals=payload.totals.model_dump(),
        avatar_b64=avatar_b64,
        avatar_mime=avatar_mime,
        chart_svg=payload.chart_svg,
    )
    pdf_bytes = await generate_pdf(html)
    fname = f'Trend_{_safe_filename(payload.mode_label)}.pdf'
    return _pdf_response(pdf_bytes, fname)


@router.post('/pdf/categorias')
async def export_categorias(
    payload: CategoriasPayload,
    current_user: User = Depends(get_current_user),
) -> Response:
    avatar_b64, avatar_mime = await _load_avatar(current_user)
    html = pdf_analytics.build_categorias_html(
        user_name=current_user.name,
        currency=current_user.currency,
        mode_label=payload.mode_label,
        period_labels=payload.period_labels,
        table=[r.model_dump() for r in payload.table],
        period_totals=payload.period_totals,
        grand_total=payload.grand_total,
        chart_cats=payload.chart_cats,
        avatar_b64=avatar_b64,
        avatar_mime=avatar_mime,
        chart_svg=payload.chart_svg,
    )
    pdf_bytes = await generate_pdf(html)
    fname = f'Categories_{_safe_filename(payload.mode_label)}.pdf'
    return _pdf_response(pdf_bytes, fname)

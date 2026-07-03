"""
Genera el PDF de cierre de período llamando a Gotenberg (HTML→PDF).
Incluye 4 gráficos SVG generados en Python (sin dependencias JS).
Página 1: identidad del usuario + KPIs + gráficos + ingresos.
Página 2+: egresos.
"""
import html as _html
import math
import re
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any

import httpx

from app.config import get_settings

_MONTHS = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

_PALETTE = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#3b82f6', '#ef4444', '#06b6d4', '#84cc16', '#f97316',
]


def _fmt(amount: Decimal | float | None, currency: str) -> str:
    if amount is None:
        return '—'
    n = float(amount)
    sign = '-' if n < 0 else ''
    if currency in {'CLP', 'CRC', 'COP', 'PYG', 'JPY', 'KRW', 'IDR', 'VND'}:
        s = f'{abs(n):,.0f}'
    else:
        s = f'{abs(n):,.2f}'
    s = s.replace(',', 'X').replace('.', ',').replace('X', '.')
    return f'{sign}{s} {currency}'


def _e(s: Any) -> str:
    return _html.escape(str(s)) if s is not None else ''


_SVG_DANGEROUS_TAGS = re.compile(
    r'<\s*(script|foreignObject|iframe|image|use|object|embed|link|style)\b[^>]*>.*?<\s*/\s*\1\s*>'
    r'|<\s*(script|foreignObject|iframe|image|use|object|embed|link|style)\b[^>]*/?>',
    re.IGNORECASE | re.DOTALL,
)
_SVG_EVENT_ATTR = re.compile(r'\son[a-zA-Z]+\s*=\s*(".*?"|\'.*?\')', re.IGNORECASE | re.DOTALL)
_SVG_URL_ATTR = re.compile(r'\s(?:href|xlink:href|src)\s*=\s*(".*?"|\'.*?\')', re.IGNORECASE | re.DOTALL)


def _sanitize_svg(svg: Any) -> str:
    """
    Sanitiza un SVG provisto por el cliente (extraído del DOM del gráfico
    renderizado en el navegador) antes de incrustarlo en el HTML que Gotenberg
    convierte a PDF. Quita vectores de SSRF/XSS — tags que cargan recursos
    externos, handlers de eventos, referencias href/src — sin descartar el
    gráfico completo. Si el contenido no parece un SVG válido, se descarta.
    """
    if not isinstance(svg, str):
        return ''
    s = svg.strip()
    if not s.lower().startswith('<svg') or len(s) > 200_000:
        return ''
    s = _SVG_DANGEROUS_TAGS.sub('', s)
    s = _SVG_EVENT_ATTR.sub('', s)
    s = _SVG_URL_ATTR.sub('', s)
    return s


def _ps_val(obj, field: str, fallback: str = '') -> str:
    """Lee .value de un enum o devuelve str(). Evita el bug str(StrEnum) en Py 3.10."""
    v = getattr(obj, field, None)
    if v is None:
        return fallback
    return v.value if hasattr(v, 'value') else str(v)


# ─── SVG Charts ───────────────────────────────────────────────────────────────

def _donut_svg(items: list[tuple[str, float]], width: int = 340, donut_d: int = 148) -> str:
    slices = [(lbl, v) for lbl, v in items if v > 0]
    total = sum(v for _, v in slices)
    if not total:
        return f'<svg width="{width}" height="50"><text x="10" y="28" font-size="11" fill="#9ca3af">Sin datos</text></svg>'

    cx = cy = donut_d // 2
    R, r = cx - 7, cx - 40
    paths, angle = [], -90.0

    for i, (_, val) in enumerate(slices):
        sweep = val / total * 360
        if sweep < 0.5:
            angle += sweep
            continue
        color = _PALETTE[i % len(_PALETTE)]
        a1, a2 = math.radians(angle), math.radians(angle + sweep)
        lf = 1 if sweep > 180 else 0
        ox1, oy1 = cx + R * math.cos(a1), cy + R * math.sin(a1)
        ox2, oy2 = cx + R * math.cos(a2), cy + R * math.sin(a2)
        ix2, iy2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
        ix1, iy1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        d = (f"M{ox1:.1f},{oy1:.1f}"
             f"A{R},{R},0,{lf},1,{ox2:.1f},{oy2:.1f}"
             f"L{ix2:.1f},{iy2:.1f}"
             f"A{r},{r},0,{lf},0,{ix1:.1f},{iy1:.1f}Z")
        paths.append(f'<path d="{d}" fill="{color}" stroke="#fff" stroke-width="1.5"/>')
        angle += sweep

    leg_x = donut_d + 14
    rows, y0 = [], 4
    for i, (label, val) in enumerate(slices[:9]):
        pct = val / total * 100
        color = _PALETTE[i % len(_PALETTE)]
        short = (label[:22] + '…') if len(label) > 22 else label
        rows += [
            f'<rect x="{leg_x}" y="{y0}" width="9" height="9" rx="2" fill="{color}"/>',
            f'<text x="{leg_x+13}" y="{y0+8}" font-size="9.5" fill="#374151">{_e(short)}</text>',
            f'<text x="{width-2}" y="{y0+8}" text-anchor="end" font-size="9" fill="#6b7280" font-weight="600">{pct:.1f}%</text>',
        ]
        y0 += 17

    height = max(donut_d, y0 + 4)
    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">'
        f'{"".join(paths)}'
        f'{"".join(rows)}'
        f'</svg>'
    )


def _hbars_svg(items: list[tuple[str, float]], fmt_fn, width: int = 340) -> str:
    if not items:
        return f'<svg width="{width}" height="50"><text x="10" y="28" font-size="11" fill="#9ca3af">Sin datos</text></svg>'

    label_w, val_w = 122, 80
    bar_area = width - label_w - val_w - 6
    bar_h, gap = 16, 9
    max_val = max(v for _, v in items) or 1

    rows = []
    for i, (label, val) in enumerate(items):
        y = i * (bar_h + gap)
        bw = val / max_val * bar_area
        color = _PALETTE[i % len(_PALETTE)]
        short = (label[:18] + '…') if len(label) > 18 else label
        rows += [
            f'<text x="{label_w - 4}" y="{y + bar_h - 2}" text-anchor="end" font-size="9.5" fill="#374151">{_e(short)}</text>',
            f'<rect x="{label_w}" y="{y}" width="{bw:.1f}" height="{bar_h}" rx="3" fill="{color}"/>',
            f'<text x="{label_w + bw + 4}" y="{y + bar_h - 2}" font-size="9" fill="#6b7280">{_e(fmt_fn(val))}</text>',
        ]

    height = len(items) * (bar_h + gap) - gap + 4
    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">'
        f'{"".join(rows)}'
        f'</svg>'
    )


def _columns_svg(income: float, expenses: float, fmt_fn, width: int = 340, height: int = 195) -> str:
    if income == 0 and expenses == 0:
        return f'<svg width="{width}" height="50"><text x="10" y="28" font-size="11" fill="#9ca3af">Sin datos</text></svg>'

    chart_h = height - 58
    max_v = max(income, expenses, 1)
    bar_w, gap = 72, 48
    sx = (width - 2 * bar_w - gap) // 2
    ex = sx + bar_w + gap
    base = chart_h + 10
    ih = income   / max_v * chart_h
    eh = expenses / max_v * chart_h
    balance = income - expenses
    bal_color = '#059669' if balance >= 0 else '#dc2626'

    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">'
        f'<line x1="0" y1="{base}" x2="{width}" y2="{base}" stroke="#e5e7eb" stroke-width="1"/>'
        f'<rect x="{sx}" y="{base - ih:.1f}" width="{bar_w}" height="{ih:.1f}" rx="5" fill="#10b981"/>'
        f'<text x="{sx + bar_w//2}" y="{base - ih - 5:.1f}" text-anchor="middle" font-size="9" font-weight="700" fill="#059669">{_e(fmt_fn(income))}</text>'
        f'<text x="{sx + bar_w//2}" y="{base + 16}" text-anchor="middle" font-size="10" fill="#374151">Ingresos</text>'
        f'<rect x="{ex}" y="{base - eh:.1f}" width="{bar_w}" height="{eh:.1f}" rx="5" fill="#ef4444"/>'
        f'<text x="{ex + bar_w//2}" y="{base - eh - 5:.1f}" text-anchor="middle" font-size="9" font-weight="700" fill="#dc2626">{_e(fmt_fn(expenses))}</text>'
        f'<text x="{ex + bar_w//2}" y="{base + 16}" text-anchor="middle" font-size="10" fill="#374151">Egresos</text>'
        f'<text x="{width//2}" y="{height - 4}" text-anchor="middle" font-size="10.5" fill="{bal_color}" font-weight="700">'
        f'Balance: {_e(fmt_fn(abs(balance)))} {"▲" if balance >= 0 else "▼"}'
        f'</text>'
        f'</svg>'
    )


# ─── Agregación ───────────────────────────────────────────────────────────────

def _by_category(expenses) -> list[tuple[str, float]]:
    acc: dict[str, float] = defaultdict(float)
    for e in expenses:
        cat = getattr(e, 'category', None)
        acc[cat.name if cat else 'Sin categoría'] += float(e.amount or 0)
    return sorted(acc.items(), key=lambda x: x[1], reverse=True)


def _by_type(expenses) -> list[tuple[str, float]]:
    rec = pun = 0.0
    for e in expenses:
        cat = getattr(e, 'category', None)
        t = _ps_val(cat, 'type') if cat else 'puntual'
        if 'recurrente' in t:
            rec += float(e.amount or 0)
        else:
            pun += float(e.amount or 0)
    return [('Recurrente', rec), ('Puntual', pun)]


# ─── Cabecera de identidad ────────────────────────────────────────────────────

def _user_header_html(user_name: str, period_label: str, closed_at: datetime,
                      avatar_b64: str | None, avatar_mime: str) -> str:
    tz_name = closed_at.tzname() or ''
    closed_str = closed_at.strftime('%d/%m/%Y %H:%M') + (f' {tz_name}' if tz_name and tz_name != 'UTC' else '')
    if avatar_b64:
        avatar_html = (f'<img src="data:{avatar_mime};base64,{avatar_b64}" '
                       f'class="avatar" alt="avatar"/>')
    else:
        initials = ''.join(p[0].upper() for p in user_name.split()[:2]) or '?'
        avatar_html = f'<div class="avatar-ph">{_e(initials)}</div>'

    return f"""<div class="cover-id">
  {avatar_html}
  <div class="cover-text">
    <div class="cover-title">Resumen de período</div>
    <div class="cover-name">{_e(user_name)}</div>
    <div class="cover-period">{_e(period_label)}</div>
    <div class="cover-date">Cerrado: {_e(closed_str)}</div>
  </div>
</div>"""


# ─── HTML principal ───────────────────────────────────────────────────────────

def build_report_html(
    *,
    year: int,
    month: int,
    currency: str,
    total_incomes: Decimal,
    total_expenses: Decimal,
    balance: Decimal,
    expenses: list,
    incomes: list,
    user_name: str = 'Usuario',
    closed_at: datetime | None = None,
    avatar_b64: str | None = None,
    avatar_mime: str = 'image/jpeg',
    notes: str | None = None,
) -> str:
    period_label = f'{_MONTHS[month]} {year}'
    bal_color = '#059669' if balance >= 0 else '#dc2626'
    if closed_at is None:
        closed_at = datetime.utcnow()

    def fmt(v): return _fmt(v, currency)
    def fmt_f(v): return _fmt(Decimal(str(v)), currency)

    # ── Gráficos ──
    by_cat  = _by_category(expenses)
    by_type = _by_type(expenses)

    svg_cat_donut  = _donut_svg(by_cat[:10])
    svg_top_bars   = _hbars_svg(by_cat[:8], fmt_f)
    svg_columns    = _columns_svg(float(total_incomes), float(total_expenses), fmt_f)
    svg_type_donut = _donut_svg(by_type)

    cover_html = _user_header_html(user_name, period_label, closed_at, avatar_b64, avatar_mime)

    notes_html = (
        '<div style="margin-top:20px;border:1px solid #e5e7eb;border-left:3px solid #6366f1;'
        'border-radius:6px;padding:10px 14px;background:#f9fafb">'
        '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;'
        'letter-spacing:.4px;margin-bottom:5px">Observaciones del período</div>'
        f'<div style="font-size:11px;color:#374151;white-space:pre-wrap">{_e(notes)}</div>'
        '</div>'
    ) if notes else ''

    # ── Filas de ingresos ──
    def income_rows() -> str:
        rows = []
        for i in incomes:
            it = getattr(i, 'income_type', None)
            ps = _ps_val(i, 'payment_status')
            st = ('<span style="color:#059669;font-weight:600">Recibido</span>'
                  if ps == 'recibido'
                  else '<span style="color:#d97706;font-weight:600">Pendiente</span>')
            rows.append(
                f'<tr><td>{_e(i.date)}</td><td>{_e(i.label)}</td>'
                f'<td>{_e(it.name if it else "")}</td>'
                f'<td style="text-align:right">{fmt(i.amount)}</td>'
                f'<td style="text-align:center">{st}</td></tr>'
            )
        return '\n'.join(rows) if rows else (
            '<tr><td colspan="5" style="text-align:center;color:#6b7280">Sin registros</td></tr>'
        )

    # ── Filas de egresos ──
    def expense_rows() -> str:
        rows = []
        for e in expenses:
            cat = getattr(e, 'category', None)
            ps = _ps_val(e, 'payment_status')
            st = ('<span style="color:#059669;font-weight:600">Saldado</span>'
                  if ps == 'saldado'
                  else '<span style="color:#d97706;font-weight:600">Pendiente</span>')
            rows.append(
                f'<tr><td>{_e(e.date)}</td><td>{_e(e.label)}</td>'
                f'<td>{_e(cat.name if cat else "")}</td>'
                f'<td style="text-align:right">{fmt(e.amount)}</td>'
                f'<td style="text-align:center">{st}</td></tr>'
            )
        return '\n'.join(rows) if rows else (
            '<tr><td colspan="5" style="text-align:center;color:#6b7280">Sin registros</td></tr>'
        )

    th = 'background:#f3f4f6;padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151;font-size:11px'
    td = 'padding:6px 10px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:11px'

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111827;background:#fff;padding:28px 32px}}
  h2{{font-size:13px;font-weight:600;color:#374151;margin:22px 0 8px;border-left:3px solid #6366f1;padding-left:8px}}
  .cover-id{{display:flex;align-items:center;gap:20px;border-bottom:2px solid #e5e7eb;padding-bottom:18px;margin-bottom:18px}}
  .avatar{{width:68px;height:68px;border-radius:50%;object-fit:cover;border:2px solid #e5e7eb;flex-shrink:0}}
  .avatar-ph{{width:68px;height:68px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:700;flex-shrink:0}}
  .cover-title{{font-size:20px;font-weight:700;color:#111827;margin-bottom:4px}}
  .cover-name{{font-size:14px;font-weight:600;color:#374151;margin-bottom:2px}}
  .cover-period{{font-size:13px;color:#6b7280;margin-bottom:2px}}
  .cover-date{{font-size:11px;color:#9ca3af}}
  .kpis{{display:flex;gap:12px;margin-bottom:20px}}
  .kpi{{flex:1;border:1px solid #e5e7eb;border-radius:9px;padding:12px 16px}}
  .kpi-label{{font-size:10px;color:#6b7280;margin-bottom:3px;text-transform:uppercase;letter-spacing:.4px}}
  .kpi-value{{font-size:17px;font-weight:700}}
  .charts{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}}
  .chart-box{{border:1px solid #e5e7eb;border-radius:9px;padding:12px 14px}}
  .chart-title{{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}}
  table{{width:100%;border-collapse:collapse;margin-top:6px}}
  th{{{th}}}
  td{{{td}}}
  tr:last-child td{{border-bottom:none}}
  .page-break{{page-break-before:always;break-before:page;height:0;margin:0;padding:0}}
  .footer{{margin-top:28px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}}
</style>
</head>
<body>

{cover_html}

<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Total ingresos</div>
    <div class="kpi-value" style="color:#059669">{fmt(total_incomes)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Total egresos</div>
    <div class="kpi-value" style="color:#dc2626">{fmt(total_expenses)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Balance</div>
    <div class="kpi-value" style="color:{bal_color}">{fmt(balance)}</div>
  </div>
</div>

{notes_html}

<h2>Análisis visual</h2>
<div class="charts">
  <div class="chart-box">
    <div class="chart-title">Distribución por categoría</div>
    {svg_cat_donut}
  </div>
  <div class="chart-box">
    <div class="chart-title">Top categorías — egresos</div>
    {svg_top_bars}
  </div>
  <div class="chart-box">
    <div class="chart-title">Ingresos vs Egresos</div>
    {svg_columns}
  </div>
  <div class="chart-box">
    <div class="chart-title">Tipo de egreso — puntual vs recurrente</div>
    {svg_type_donut}
  </div>
</div>

<div style="break-inside:avoid;page-break-inside:avoid">
<h2>Ingresos ({len(incomes)} registros)</h2>
<table>
  <thead><tr>
    <th>Fecha</th><th>Descripción</th><th>Tipo</th>
    <th style="text-align:right">Monto</th><th style="text-align:center">Estado</th>
  </tr></thead>
  <tbody>{income_rows()}</tbody>
  <tfoot><tr style="background:#f0fdf4">
    <td colspan="3" style="padding:7px 10px;font-weight:700;color:#374151;font-size:11px">Total ingresos</td>
    <td style="padding:7px 10px;text-align:right;font-weight:700;color:#059669;font-size:11px">{fmt(total_incomes)}</td>
    <td></td>
  </tr></tfoot>
</table>
</div>

<div class="page-break"></div>

<h2>Egresos ({len(expenses)} registros)</h2>
<table>
  <thead><tr>
    <th>Fecha</th><th>Descripción</th><th>Categoría</th>
    <th style="text-align:right">Monto</th><th style="text-align:center">Estado</th>
  </tr></thead>
  <tbody>{expense_rows()}</tbody>
  <tfoot><tr style="background:#fef2f2">
    <td colspan="3" style="padding:7px 10px;font-weight:700;color:#374151;font-size:11px">Total egresos</td>
    <td style="padding:7px 10px;text-align:right;font-weight:700;color:#dc2626;font-size:11px">{fmt(total_expenses)}</td>
    <td></td>
  </tr></tfoot>
</table>

<div class="footer">Generado por ControlGastos · {_e(period_label)} · {_e(user_name)}</div>
</body>
</html>"""


async def generate_pdf(html_content: str) -> bytes:
    settings = get_settings()
    url = f"{settings.gotenberg_url}/forms/chromium/convert/html"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            files={"index.html": ("index.html", html_content.encode("utf-8"), "text/html")},
        )
        resp.raise_for_status()
    return resp.content

"""
Generadores HTML→PDF para los reportes analíticos.
Reutiliza helpers de pdf_report (formato, SVG base) y agrega gráficos propios.
"""
import html as _html
import math
from datetime import datetime
from typing import Any

from app.services.pdf_report import _fmt, _e, _PALETTE, generate_pdf  # noqa: F401

# ─── Helpers compartidos ──────────────────────────────────────────────────────

def _fmt_short(v: float) -> str:
    """Número abreviado para ejes de gráficos (sin moneda)."""
    if v >= 1_000_000:
        return f'{v/1_000_000:.1f}M'
    if v >= 1_000:
        return f'{v/1_000:.0f}K'
    return str(int(v))


def _signed(v: float, fmt_fn) -> str:
    if v == 0:
        return '—'
    return f'{"+" if v > 0 else ""}{fmt_fn(abs(v) if v < 0 else v)}'


def _delta_color(v: float, higher_is_better: bool) -> str:
    if v == 0:
        return '#9ca3af'
    good = (higher_is_better and v > 0) or (not higher_is_better and v < 0)
    return '#059669' if good else '#dc2626'


# ─── SVG: doble barra horizontal (comparación por categoría) ─────────────────

def _double_hbars_svg(
    items: list[tuple[str, float, float]],
    label_a: str,
    label_b: str,
    fmt_fn,
    width: int = 680,
) -> str:
    if not items:
        return f'<svg width="{width}" height="50" xmlns="http://www.w3.org/2000/svg"><text x="10" y="28" font-size="11" fill="#9ca3af">Sin datos</text></svg>'

    lw = 130          # ancho de etiqueta izquierda
    vw = 90           # espacio para valor a la derecha
    bar_area = width - lw - vw
    bh, gi, go = 10, 2, 10  # bar_h, gap_inner, gap_outer
    CA, CB = '#3b82f6', '#f97316'
    max_v = max(max(a, b) for _, a, b in items) or 1

    rows: list[str] = []
    for i, (name, va, vb) in enumerate(items):
        y = i * (bh * 2 + gi + go)
        bwa = va / max_v * bar_area
        bwb = vb / max_v * bar_area
        short = (name[:19] + '…') if len(name) > 19 else name
        rows += [
            f'<text x="{lw-4}" y="{y+bh}" text-anchor="end" font-size="9" fill="#374151">{_e(short)}</text>',
            f'<rect x="{lw}" y="{y}" width="{bwa:.1f}" height="{bh}" rx="2" fill="{CA}"/>',
            f'<text x="{lw+bwa+3}" y="{y+bh}" font-size="8" fill="#6b7280">{_e(fmt_fn(va))}</text>' if va > 0 else '',
            f'<rect x="{lw}" y="{y+bh+gi}" width="{bwb:.1f}" height="{bh}" rx="2" fill="{CB}"/>',
            f'<text x="{lw+bwb+3}" y="{y+bh+gi+bh}" font-size="8" fill="#6b7280">{_e(fmt_fn(vb))}</text>' if vb > 0 else '',
        ]

    leg_y = len(items) * (bh * 2 + gi + go) + 8
    rows += [
        f'<rect x="{lw}" y="{leg_y}" width="9" height="9" rx="2" fill="{CA}"/>',
        f'<text x="{lw+13}" y="{leg_y+8}" font-size="9" fill="#374151">{_e(label_a)}</text>',
        f'<rect x="{lw+110}" y="{leg_y}" width="9" height="9" rx="2" fill="{CB}"/>',
        f'<text x="{lw+123}" y="{leg_y+8}" font-size="9" fill="#374151">{_e(label_b)}</text>',
    ]

    h = leg_y + 20
    return (
        f'<svg width="{width}" height="{h}" viewBox="0 0 {width} {h}" xmlns="http://www.w3.org/2000/svg">'
        + ''.join(rows) +
        f'</svg>'
    )


# ─── SVG: multi-línea (tendencia / evolución) ─────────────────────────────────

def _multiline_svg(
    labels: list[str],
    series: list[tuple[str, str, list[float]]],
    width: int = 680,
    height: int = 220,
) -> str:
    """
    labels: etiquetas del eje X
    series: [(nombre, color_hex, [valores])]
    """
    n = len(labels)
    if n == 0:
        return f'<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg"><text x="10" y="28" font-size="11" fill="#9ca3af">Sin datos</text></svg>'

    lm, rm, tm, bm = 68, 16, 10, 52  # márgenes
    cw = width - lm - rm
    ch = height - tm - bm

    all_vals = [v for _, _, vals in series for v in vals if v > 0]
    max_v = max(all_vals) if all_vals else 1

    def px(i: int) -> float:
        return lm + i * cw / max(n - 1, 1)

    def py(v: float) -> float:
        return tm + ch * (1 - v / max_v)

    els: list[str] = []

    # Líneas de grid horizontales
    for frac in [0.25, 0.5, 0.75, 1.0]:
        yg = py(max_v * frac)
        els.append(f'<line x1="{lm}" y1="{yg:.1f}" x2="{lm+cw}" y2="{yg:.1f}" stroke="#f1f5f9" stroke-width="1"/>')
        els.append(f'<text x="{lm-4}" y="{yg+3:.1f}" text-anchor="end" font-size="8" fill="#9ca3af">{_fmt_short(max_v*frac)}</text>')

    # Eje X: mostrar hasta 10 etiquetas
    step = max(1, n // 10)
    for i, lbl in enumerate(labels):
        if i % step == 0 or i == n - 1:
            els.append(
                f'<text x="{px(i):.1f}" y="{height-bm+14}" '
                f'text-anchor="middle" font-size="8.5" fill="#9ca3af">{_e(lbl)}</text>'
            )

    # Líneas y puntos
    for name, color, vals in series:
        if len(vals) < 1:
            continue
        pts = [(px(i), py(v)) for i, v in enumerate(vals)]
        poly = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        els.append(f'<polyline points="{poly}" fill="none" stroke="{color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
        for x, y in pts:
            els.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.5" fill="{color}" stroke="#fff" stroke-width="1.5"/>')

    # Leyenda (debajo del gráfico, antes de las etiquetas X)
    leg_y = height - bm + 26
    leg_x = lm
    for name, color, _ in series:
        els.append(f'<rect x="{leg_x}" y="{leg_y-8}" width="10" height="10" rx="2" fill="{color}"/>')
        els.append(f'<text x="{leg_x+13}" y="{leg_y+1}" font-size="8.5" fill="#374151">{_e(name)}</text>')
        leg_x += min(130, max(80, len(name) * 6 + 20))

    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">'
        + ''.join(els) +
        f'</svg>'
    )


# ─── Cabecera compartida ──────────────────────────────────────────────────────

_BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111827;background:#fff;padding:28px 32px}
h2{font-size:13px;font-weight:600;color:#374151;margin:22px 0 8px;border-left:3px solid #6366f1;padding-left:8px}
.cover-id{display:flex;align-items:center;gap:20px;border-bottom:2px solid #e5e7eb;padding-bottom:18px;margin-bottom:18px}
.avatar{width:68px;height:68px;border-radius:50%;object-fit:cover;border:2px solid #e5e7eb;flex-shrink:0}
.avatar-ph{width:68px;height:68px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:700;flex-shrink:0}
.cover-title{font-size:20px;font-weight:700;color:#111827;margin-bottom:4px}
.cover-name{font-size:14px;font-weight:600;color:#374151;margin-bottom:2px}
.cover-period{font-size:13px;color:#6b7280;margin-bottom:2px}
.cover-date{font-size:11px;color:#9ca3af}
table{width:100%;border-collapse:collapse;margin-top:6px}
th{background:#f3f4f6;padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151;font-size:11px}
td{padding:6px 10px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:11px}
tr:last-child td{border-bottom:none}
.footer{margin-top:28px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
.chart-box{border:1px solid #e5e7eb;border-radius:9px;padding:14px 16px;margin-bottom:18px;overflow:hidden}
.chart-title{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.section{break-inside:avoid;page-break-inside:avoid}
.chart-img{max-width:100%;height:auto;display:block}
"""


def _build_cover(user_name: str, report_title: str, subtitle: str,
                 avatar_b64: str | None, avatar_mime: str) -> str:
    now = datetime.now().strftime('%d/%m/%Y %H:%M')
    if avatar_b64:
        avatar_html = f'<img src="data:{avatar_mime};base64,{avatar_b64}" class="avatar" alt="avatar"/>'
    else:
        initials = ''.join(p[0].upper() for p in user_name.split()[:2]) or '?'
        avatar_html = f'<div class="avatar-ph">{_e(initials)}</div>'

    return (
        f'<div class="cover-id">'
        f'{avatar_html}'
        f'<div>'
        f'<div class="cover-title">{_e(report_title)}</div>'
        f'<div class="cover-name">{_e(user_name)}</div>'
        f'<div class="cover-period">{_e(subtitle)}</div>'
        f'<div class="cover-date">Generado: {now}</div>'
        f'</div>'
        f'</div>'
    )


def _wrap_html(body: str, title: str) -> str:
    return (
        f'<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>'
        f'<title>{_e(title)}</title>'
        f'<style>{_BASE_CSS}</style>'
        f'</head><body>{body}</body></html>'
    )


# ─── Comparación de períodos ──────────────────────────────────────────────────

def build_comparacion_html(
    *,
    user_name: str,
    currency: str,
    label_a: str,
    label_b: str,
    kpi_rows: list[dict],
    categories: list[dict],
    avatar_b64: str | None = None,
    avatar_mime: str = 'image/jpeg',
    chart_svg: str | None = None,
) -> str:
    """
    kpi_rows: [{label, va, vb, delta, delta_pct, higher_is_better}]
    categories: [{name, total_a, total_b, delta}]
    """
    def fmt(v: Any) -> str:
        from decimal import Decimal
        return _fmt(Decimal(str(v)), currency)

    cover = _build_cover(user_name, 'Comparación de períodos',
                         f'{label_a} vs {label_b}', avatar_b64, avatar_mime)

    # ── Tabla KPI ──
    kpi_rows_html = ''
    for row in kpi_rows:
        d = row['delta']
        pct = row.get('delta_pct')
        hib = row.get('higher_is_better', True)
        dc = _delta_color(d, hib)
        d_str = f'<span style="color:{dc};font-weight:600">{_signed(d, fmt)}</span>'
        pct_str = (f'<span style="color:{dc}">{("+" if pct > 0 else "")}{pct:.1f}%</span>'
                   if pct is not None and pct != 0 else '<span style="color:#9ca3af">—</span>')
        kpi_rows_html += (
            f'<tr><td style="font-weight:500">{_e(row["label"])}</td>'
            f'<td style="text-align:right;color:#3b82f6">{fmt(row["va"])}</td>'
            f'<td style="text-align:right;color:#f97316">{fmt(row["vb"])}</td>'
            f'<td style="text-align:right">{d_str}</td>'
            f'<td style="text-align:right">{pct_str}</td></tr>'
        )

    kpi_table = f"""<h2>Resumen comparativo</h2>
<table>
  <thead><tr>
    <th>Concepto</th>
    <th style="text-align:right;color:#3b82f6">{_e(label_a)}</th>
    <th style="text-align:right;color:#f97316">{_e(label_b)}</th>
    <th style="text-align:right">Diferencia</th>
    <th style="text-align:right">Δ %</th>
  </tr></thead>
  <tbody>{kpi_rows_html}</tbody>
</table>"""

    # ── Gráfico categorías ──
    if chart_svg:
        chart_content = chart_svg
    else:
        chart_items = [(c['name'], c['total_a'], c['total_b']) for c in categories if c['total_a'] > 0 or c['total_b'] > 0]
        chart_content = _double_hbars_svg(chart_items[:15], label_a, label_b, fmt)
    chart_section = f'<div class="section"><h2>Egresos por categoría</h2><div class="chart-box"><div class="chart-title">Comparación {_e(label_a)} vs {_e(label_b)}</div>{chart_content}</div></div>'

    # ── Tabla detalle categorías ──
    cat_rows_html = ''
    for c in categories:
        d = c['delta']
        dc = '#dc2626' if d > 0 else '#059669' if d < 0 else '#9ca3af'
        cat_rows_html += (
            f'<tr><td style="font-weight:500">{_e(c["name"])}</td>'
            f'<td style="text-align:right;color:#3b82f6">{fmt(c["total_a"]) if c["total_a"] > 0 else "—"}</td>'
            f'<td style="text-align:right;color:#f97316">{fmt(c["total_b"]) if c["total_b"] > 0 else "—"}</td>'
            f'<td style="text-align:right;color:{dc};font-weight:600">{_signed(d, fmt) if d != 0 else "—"}</td>'
            f'</tr>'
        )

    cat_table = f"""<div class="section"><h2>Detalle por categoría</h2>
<table>
  <thead><tr>
    <th>Categoría</th>
    <th style="text-align:right;color:#3b82f6">{_e(label_a)}</th>
    <th style="text-align:right;color:#f97316">{_e(label_b)}</th>
    <th style="text-align:right">Δ</th>
  </tr></thead>
  <tbody>{cat_rows_html}</tbody>
</table></div>"""

    footer = f'<div class="footer">ControlGastos · Comparación {_e(label_a)} vs {_e(label_b)} · {_e(user_name)}</div>'
    body = cover + f'<div class="section">{kpi_table}</div>' + chart_section + cat_table + footer
    return _wrap_html(body, f'Comparación {label_a} vs {label_b}')


# ─── Tendencia anual ──────────────────────────────────────────────────────────

def build_tendencia_html(
    *,
    user_name: str,
    currency: str,
    mode_label: str,
    periods: list[dict],
    totals: dict,
    avatar_b64: str | None = None,
    avatar_mime: str = 'image/jpeg',
    chart_svg: str | None = None,
) -> str:
    """
    periods: [{label, status, totalIngresos, egresosSaldados, egresosPendientes,
               egresosReservados, dineroLibre, libreSoloPagado}]
    totals: {totalIngresos, egresosSaldados, egresosPendientes, egresosReservados,
             dineroLibre, libreSoloPagado}
    """
    def fmt(v: Any) -> str:
        from decimal import Decimal
        return _fmt(Decimal(str(v)), currency)

    cover = _build_cover(user_name, 'Tendencia anual', mode_label, avatar_b64, avatar_mime)

    # ── KPI resumen (4 cards en tabla) ──
    kpi_defs = [
        ('Total ingresos',    'totalIngresos',     '#059669'),
        ('Egresos saldados',  'egresosSaldados',   '#ea580c'),
        ('Egresos pendientes','egresosPendientes', '#7c3aed'),
        ('Dinero libre (prom.)', 'dineroLibre',    '#2563eb'),
    ]
    kpi_cells = ''
    for label, key, color in kpi_defs:
        v = totals.get(key, 0)
        extra = '<br/><span style="font-size:9px;color:#9ca3af">promedio mensual</span>' if key == 'dineroLibre' else ''
        kpi_cells += (
            f'<td style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;width:25%">'
            f'<div style="font-size:9.5px;color:#6b7280;margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px">{_e(label)}</div>'
            f'<div style="font-size:15px;font-weight:700;color:{color}">{fmt(v)}{extra}</div>'
            f'</td>'
        )
    kpi_block = f'<table style="border-collapse:separate;border-spacing:10px 0;margin-bottom:8px;width:100%"><tr>{kpi_cells}</tr></table>'

    # ── Gráfico ──
    if chart_svg:
        chart_content = chart_svg
    else:
        labels = [p['label'] for p in periods]
        chart_content = _multiline_svg(labels, [
            ('Ingresos',         '#10b981', [p['totalIngresos']    for p in periods]),
            ('Egresos saldados', '#f97316', [p['egresosSaldados']  for p in periods]),
            ('Dinero libre',     '#3b82f6', [p['dineroLibre']      for p in periods]),
        ])
    chart_section = f'<div class="section"><h2>Evolución mensual</h2><div class="chart-box">{chart_content}</div></div>'

    # ── Tabla período a período ──
    period_rows_html = ''
    for p in periods:
        dl = p['dineroLibre']
        dl_color = '#2563eb' if dl >= 0 else '#dc2626'
        status_bg = '#f0fdf4' if p['status'] == 'abierto' else '#f9fafb'
        status_color = '#059669' if p['status'] == 'abierto' else '#6b7280'
        period_rows_html += (
            f'<tr>'
            f'<td style="font-weight:500">{_e(p["label"])}</td>'
            f'<td style="text-align:right;color:#059669">{fmt(p["totalIngresos"])}</td>'
            f'<td style="text-align:right;color:#ea580c">{fmt(p["egresosSaldados"])}</td>'
            f'<td style="text-align:right;color:#7c3aed">{fmt(p["egresosPendientes"])}</td>'
            f'<td style="text-align:right;color:#374151">{fmt(p["egresosReservados"])}</td>'
            f'<td style="text-align:right;color:{dl_color};font-weight:600">{fmt(dl)}</td>'
            f'<td style="text-align:center"><span style="background:{status_bg};color:{status_color};padding:1px 7px;border-radius:20px;font-size:9.5px;font-weight:600">{_e(p["status"])}</span></td>'
            f'</tr>'
        )

    t = totals
    total_row = (
        f'<tr style="border-top:2px solid #e5e7eb;background:#f9fafb">'
        f'<td style="font-weight:700;color:#374151">Total acum.</td>'
        f'<td style="text-align:right;font-weight:700;color:#059669">{fmt(t.get("totalIngresos",0))}</td>'
        f'<td style="text-align:right;font-weight:700;color:#ea580c">{fmt(t.get("egresosSaldados",0))}</td>'
        f'<td style="text-align:right;font-weight:700;color:#7c3aed">{fmt(t.get("egresosPendientes",0))}</td>'
        f'<td style="text-align:right;font-weight:700;color:#374151">{fmt(t.get("egresosReservados",0))}</td>'
        f'<td style="text-align:right;font-size:9px;color:#9ca3af">prom. {fmt(t.get("dineroLibre",0))}</td>'
        f'<td></td>'
        f'</tr>'
    )

    period_table = f"""<div class="section"><h2>Detalle por período</h2>
<table>
  <thead><tr>
    <th>Período</th>
    <th style="text-align:right;color:#059669">Ingresos</th>
    <th style="text-align:right;color:#ea580c">Saldados</th>
    <th style="text-align:right;color:#7c3aed">Pendientes</th>
    <th style="text-align:right">Reservados</th>
    <th style="text-align:right;color:#2563eb">Dinero libre</th>
    <th style="text-align:center">Estado</th>
  </tr></thead>
  <tbody>{period_rows_html}</tbody>
  <tfoot>{total_row}</tfoot>
</table></div>"""

    footer = f'<div class="footer">ControlGastos · Tendencia {_e(mode_label)} · {_e(user_name)}</div>'
    body = cover + f'<div class="section">{kpi_block}</div>' + chart_section + period_table + footer
    return _wrap_html(body, f'Tendencia {mode_label}')


# ─── Evolución por categoría ──────────────────────────────────────────────────

def build_categorias_html(
    *,
    user_name: str,
    currency: str,
    mode_label: str,
    period_labels: list[str],
    table: list[dict],
    period_totals: list[float],
    grand_total: float,
    chart_cats: list[str],
    avatar_b64: str | None = None,
    avatar_mime: str = 'image/jpeg',
    chart_svg: str | None = None,
) -> str:
    """
    table: [{name, values: [float], total}]
    chart_cats: categorías seleccionadas para el gráfico
    """
    def fmt(v: Any) -> str:
        from decimal import Decimal
        return _fmt(Decimal(str(v)), currency)

    cover = _build_cover(user_name, 'Evolución por categoría', mode_label, avatar_b64, avatar_mime)

    # ── Gráfico multi-línea ──
    if chart_svg:
        chart_content = chart_svg
    else:
        chart_series = []
        cat_index = {row['name']: row['values'] for row in table}
        for i, cat in enumerate(chart_cats[:10]):
            if cat in cat_index:
                chart_series.append((cat, _PALETTE[i % len(_PALETTE)], cat_index[cat]))
        chart_content = _multiline_svg(period_labels, chart_series, height=240)
    chart_section = f'<div class="section"><h2>Evolución mensual por categoría</h2><div class="chart-box">{chart_content}</div></div>'

    # ── Tabla categorías × períodos ──
    header_cells = '<th>Categoría</th>' + ''.join(
        f'<th style="text-align:right">{_e(lbl)}</th>' for lbl in period_labels
    ) + '<th style="text-align:right;font-weight:700">Total</th>'

    cat_rows_html = ''
    for row in table:
        cells = f'<td style="font-weight:500">{_e(row["name"])}</td>'
        for v in row['values']:
            cells += f'<td style="text-align:right">{fmt(v) if v > 0 else "<span style=\'color:#e5e7eb\'>—</span>"}</td>'
        cells += f'<td style="text-align:right;font-weight:700">{fmt(row["total"])}</td>'
        cat_rows_html += f'<tr>{cells}</tr>'

    totals_cells = '<td style="font-weight:700;color:#374151">Total período</td>' + ''.join(
        f'<td style="text-align:right;font-weight:700">{fmt(v)}</td>' for v in period_totals
    ) + f'<td style="text-align:right;font-weight:700">{fmt(grand_total)}</td>'

    cat_table = f"""<div class="section"><h2>Tabla de egresos por categoría y período</h2>
<div style="overflow-x:auto">
<table>
  <thead><tr>{header_cells}</tr></thead>
  <tbody>{cat_rows_html}</tbody>
  <tfoot><tr style="border-top:2px solid #e5e7eb;background:#f9fafb">{totals_cells}</tr></tfoot>
</table>
</div></div>"""

    footer = f'<div class="footer">ControlGastos · Evolución por categoría {_e(mode_label)} · {_e(user_name)}</div>'
    body = cover + chart_section + cat_table + footer
    return _wrap_html(body, f'Categorías {mode_label}')

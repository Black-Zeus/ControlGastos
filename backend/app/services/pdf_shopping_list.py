"""
PDF de evidencia de una lista de compra enviada a egreso (HTML → PDF vía Gotenberg).
Se adjunta al egreso al enviarlo: deja constancia de los productos, cantidades,
precios y de las fechas de creación de la lista, de compra y de envío.
"""
import base64
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from app.services.pdf_report import _e, _fmt

# Mismo logo que los correos (el backend no tiene acceso a los assets del frontend).
_LOGO_PATH = Path(__file__).parent.parent / "templates" / "email" / "logo-email.png"


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    try:
        return "data:image/png;base64," + base64.b64encode(_LOGO_PATH.read_bytes()).decode()
    except OSError:
        return ""


@dataclass
class EvidenceRow:
    label: str
    subtotal: Decimal
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    obviable: bool = False


def _fmt_date(d: Optional[date | datetime], tz: Optional[ZoneInfo] = None) -> str:
    if d is None:
        return '—'
    if isinstance(d, datetime):
        # Los timestamps se guardan en UTC sin zona: se muestran en la zona del usuario.
        if tz is not None:
            d = (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(tz)
        return d.strftime('%d/%m/%Y %H:%M')
    return d.strftime('%d/%m/%Y')


def _fmt_qty(q: Optional[Decimal]) -> str:
    if q is None:
        return '—'
    return f'{q:.2f}'.rstrip('0').rstrip('.').replace('.', ',')


def build_shopping_list_evidence_html(
    *,
    list_name: str,
    expense_label: str,
    user_name: str,
    currency: str,
    user_timezone: str,
    list_created_at: datetime,
    sent_at: datetime,
    expense_date: date,
    planned_date: Optional[date],
    category_name: str,
    responsible: Optional[str],
    observation: Optional[str],
    rows: list[EvidenceRow],
) -> str:
    try:
        tz: Optional[ZoneInfo] = ZoneInfo(user_timezone)
    except Exception:
        tz = None
    total = sum((r.subtotal for r in rows), Decimal('0'))
    obviable_total = sum((r.subtotal for r in rows if r.obviable), Decimal('0'))
    logo = _logo_data_uri()
    logo_html = f'<img class="logo" src="{logo}" alt="ControlGastos">' if logo else ''

    body_rows = ''.join(
        f"""<tr>
          <td class="idx">{n}</td>
          <td class="prod">{_e(r.label)}{' <span class="tag">obviable</span>' if r.obviable else ''}</td>
          <td class="num">{_fmt_qty(r.quantity)}</td>
          <td class="num">{_fmt(r.unit_price, currency) if r.unit_price is not None else '—'}</td>
          <td class="num strong">{_fmt(r.subtotal, currency)}</td>
        </tr>"""
        for n, r in enumerate(rows, start=1)
    )
    cards = [
        ('Total', _fmt(total, currency), True),
        ('Productos', str(len(rows)), False),
        ('Fecha del egreso', _fmt_date(expense_date), False),
        ('Enviada a egreso', _fmt_date(sent_at, tz), False),
    ]
    cards_html = ''.join(
        f'<div class="card{" accent" if accent else ""}"><span>{_e(k)}</span><strong>{_e(v)}</strong></div>'
        for k, v, accent in cards
    )
    meta = [
        ('Lista de compra', list_name),
        ('Descripción del egreso', expense_label),
        ('Categoría', category_name),
        ('Responsable', responsible or '—'),
        ('Lista creada', _fmt_date(list_created_at, tz)),
        ('Fecha de compra', _fmt_date(planned_date)),
    ]
    meta_html = ''.join(f'<div><dt>{_e(k)}</dt><dd>{_e(v)}</dd></div>' for k, v in meta)
    obviable_html = (
        f'<div class="row muted"><span>Incluye obviables</span><span>{_fmt(obviable_total, currency)}</span></div>'
        if obviable_total > 0 else ''
    )
    obs_html = (
        f'<div class="obs"><span>Observación</span><p>{_e(observation)}</p></div>' if observation else ''
    )

    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Lista de compra — {_e(list_name)}</title>
<style>
  @page {{ size: A4; margin: 0; }}
  * {{ box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; font-size: 11px; margin: 0; }}
  .page {{ min-height: 297mm; padding: 0 0 22mm; position: relative; }}

  .hero {{ background: linear-gradient(135deg, #10b981 0%, #047857 100%); color: #fff;
           padding: 14mm 16mm 10mm; display: flex; align-items: center; gap: 14px; }}
  .logo {{ width: 46px; height: 46px; border-radius: 12px; background: #fff; padding: 3px; }}
  .brand {{ flex: 1; }}
  .brand small {{ display: block; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; opacity: .85; }}
  .brand h1 {{ margin: 2px 0 0; font-size: 19px; font-weight: 700; }}
  .brand p {{ margin: 3px 0 0; font-size: 10.5px; opacity: .9; }}
  .badge {{ border: 1px solid rgba(255,255,255,.55); border-radius: 999px; padding: 4px 10px;
            font-size: 9px; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }}

  .content {{ padding: 8mm 16mm 0; }}
  .cards {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: -14mm; }}
  .card {{ background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px;
           box-shadow: 0 2px 6px rgba(0,0,0,.06); }}
  .card span {{ display: block; font-size: 8.5px; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }}
  .card strong {{ display: block; margin-top: 4px; font-size: 13px; }}
  .card.accent {{ border-color: #a7f3d0; background: #ecfdf5; }}
  .card.accent strong {{ color: #047857; font-size: 15px; }}

  h2 {{ font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #047857;
        margin: 18px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #d1fae5; }}
  dl {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; margin: 0; }}
  dt {{ color: #6b7280; font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; }}
  dd {{ margin: 2px 0 0; font-weight: 600; font-size: 11px; }}

  table {{ width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb; }}
  thead th {{ background: #047857; color: #fff; font-size: 8.5px; text-transform: uppercase;
              letter-spacing: .06em; padding: 8px 10px; text-align: left; }}
  td {{ padding: 7px 10px; border-top: 1px solid #f1f5f9; }}
  tbody tr:nth-child(even) td {{ background: #f9fafb; }}
  .idx {{ width: 26px; color: #9ca3af; }}
  .num {{ text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
  thead th.num {{ text-align: right; }}
  .strong {{ font-weight: 600; }}
  .tag {{ display: inline-block; margin-left: 6px; font-size: 7.5px; color: #92400e; background: #fef3c7;
          border-radius: 6px; padding: 1px 6px; text-transform: uppercase; letter-spacing: .04em; }}

  .summary {{ display: flex; justify-content: flex-end; margin-top: 12px; }}
  .totals {{ width: 62mm; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }}
  .totals .row {{ display: flex; justify-content: space-between; padding: 7px 12px; font-variant-numeric: tabular-nums; }}
  .totals .muted {{ color: #6b7280; font-size: 10px; }}
  .totals .grand {{ background: #047857; color: #fff; font-weight: 700; font-size: 13px; }}

  .obs {{ margin-top: 14px; background: #f9fafb; border-left: 3px solid #10b981; border-radius: 6px; padding: 8px 12px; }}
  .obs span {{ font-size: 8.5px; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }}
  .obs p {{ margin: 3px 0 0; }}

  .footer {{ position: absolute; left: 16mm; right: 16mm; bottom: 9mm; display: flex; align-items: center;
             gap: 8px; border-top: 1px solid #e5e7eb; padding-top: 6px; color: #9ca3af; font-size: 8.5px; }}
  .footer img {{ width: 14px; height: 14px; border-radius: 4px; }}
  .footer .grow {{ flex: 1; }}
</style></head>
<body><div class="page">
  <header class="hero">
    {logo_html}
    <div class="brand">
      <small>ControlGastos · Evidencia de compra</small>
      <h1>{_e(list_name)}</h1>
      <p>{_e(user_name)} · Lista de compra enviada a egreso</p>
    </div>
    <span class="badge">Comprobante</span>
  </header>

  <main class="content">
    <section class="cards">{cards_html}</section>

    <h2>Detalle</h2>
    <dl>{meta_html}</dl>

    <h2>Productos</h2>
    <table>
      <thead><tr><th>#</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Subtotal</th></tr></thead>
      <tbody>{body_rows}</tbody>
    </table>

    <div class="summary"><div class="totals">
      {obviable_html}
      <div class="row grand"><span>Total</span><span>{_fmt(total, currency)}</span></div>
    </div></div>
    {obs_html}
  </main>

  <footer class="footer">
    {f'<img src="{logo}" alt="">' if logo else ''}
    <span class="grow">Documento generado automáticamente por ControlGastos como evidencia del egreso.</span>
    <span>Generado el {_fmt_date(sent_at, tz)}</span>
  </footer>
</div></body></html>"""

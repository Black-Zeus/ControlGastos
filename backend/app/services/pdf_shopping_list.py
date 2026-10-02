"""
PDF de evidencia de una lista de compra enviada a egreso (HTML → PDF vía Gotenberg).
Se adjunta al egreso al enviarlo: deja constancia de los productos, cantidades,
precios y de las fechas de creación de la lista, de compra y de envío.
"""
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from app.services.pdf_report import _e, _fmt


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
    body_rows = ''.join(
        f"""<tr>
          <td>{_e(r.label)}{' <span class="tag">obviable</span>' if r.obviable else ''}</td>
          <td class="num">{_fmt_qty(r.quantity)}</td>
          <td class="num">{_fmt(r.unit_price, currency) if r.unit_price is not None else '—'}</td>
          <td class="num">{_fmt(r.subtotal, currency)}</td>
        </tr>"""
        for r in rows
    )
    meta = [
        ('Lista', list_name),
        ('Egreso', expense_label),
        ('Categoría', category_name),
        ('Responsable', responsible or '—'),
        ('Lista creada', _fmt_date(list_created_at, tz)),
        ('Fecha de compra', _fmt_date(planned_date)),
        ('Fecha del egreso', _fmt_date(expense_date)),
        ('Enviada a egreso', _fmt_date(sent_at, tz)),
    ]
    meta_html = ''.join(f'<div><dt>{_e(k)}</dt><dd>{_e(v)}</dd></div>' for k, v in meta)
    obs_html = f'<p class="obs"><strong>Observación:</strong> {_e(observation)}</p>' if observation else ''

    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Lista de compra — {_e(list_name)}</title>
<style>
  @page {{ size: A4; margin: 18mm 16mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; font-size: 11px; margin: 0; }}
  h1 {{ font-size: 18px; margin: 0 0 2px; }}
  .sub {{ color: #6b7280; margin: 0 0 16px; }}
  dl {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; margin: 0 0 18px;
        padding: 12px; background: #f9fafb; border-radius: 8px; }}
  dt {{ color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }}
  dd {{ margin: 2px 0 0; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ text-align: left; font-size: 9px; text-transform: uppercase; color: #6b7280;
        border-bottom: 1px solid #e5e7eb; padding: 6px 4px; }}
  td {{ border-bottom: 1px solid #f3f4f6; padding: 6px 4px; }}
  .num {{ text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
  tfoot td {{ border-top: 2px solid #e5e7eb; border-bottom: none; font-weight: 700; font-size: 12px; }}
  .tag {{ font-size: 8px; color: #6b7280; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 4px; }}
  .obs {{ margin-top: 14px; }}
  .footer {{ margin-top: 24px; color: #9ca3af; font-size: 9px; }}
</style></head>
<body>
  <h1>Lista de compra — {_e(list_name)}</h1>
  <p class="sub">Evidencia del envío a egreso · {_e(user_name)}</p>
  <dl>{meta_html}</dl>
  <table>
    <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Subtotal</th></tr></thead>
    <tbody>{body_rows}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="num">{_fmt(total, currency)}</td></tr></tfoot>
  </table>
  {obs_html}
  <div class="footer">Generado por ControlGastos el {_fmt_date(sent_at, tz)}</div>
</body></html>"""

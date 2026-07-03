"""
Servicio de email: templates Jinja2 + smtplib.
Lee config SMTP y site_url desde app_settings (BD).
Registra cada envío en email_logs.
"""
import smtplib
import logging
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders

_LOGO_PATH = Path(__file__).parent.parent / "templates" / "email" / "logo-email.png"
_HERO_ACCESO_PATH = Path(__file__).parent.parent / "templates" / "email" / "hero-acceso.png"

import jinja2
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.settings import AppSetting
from app.models.email_log import EmailLog

logger = logging.getLogger(__name__)

# ─── Jinja2 ───────────────────────────────────────────────────────────────────

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "email"
_jinja = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=True,
)


def _render(template_name: str, **ctx) -> tuple[str, str]:
    """Devuelve (subject, html). El subject se extrae de la variable `subject` del template."""
    tpl = _jinja.get_template(template_name)
    module = tpl.make_module(vars=ctx)
    subject = getattr(module, 'subject', template_name)
    html = tpl.render(**ctx)
    return subject, html


# ─── Config SMTP ──────────────────────────────────────────────────────────────

_SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_use_tls']

async def _load_smtp(db: AsyncSession) -> dict:
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.in_(_SMTP_KEYS + ['site_url']))
    )
    settings = {row.key: (row.value or '') for row in result.scalars().all()}
    return {
        'host':     settings.get('smtp_host', ''),
        'port':     int(settings.get('smtp_port') or 587),
        'user':     settings.get('smtp_user', ''),
        'password': settings.get('smtp_password', ''),
        'from':     settings.get('smtp_from') or settings.get('smtp_user', ''),
        'use_tls':  (settings.get('smtp_use_tls') or 'true').lower() not in ('false', '0', 'no'),
        'site_url': settings.get('site_url', '').rstrip('/'),
    }


# ─── Log ──────────────────────────────────────────────────────────────────────

async def _write_log(db: AsyncSession, to_email: str, subject: str, status: str, error_msg: str | None = None) -> None:
    try:
        db.add(EmailLog(to_email=to_email, subject=subject, status=status, error_msg=error_msg))
        await db.commit()
    except Exception as exc:
        logger.warning("No se pudo registrar log de email: %s", exc)


# ─── SMTP raw send ────────────────────────────────────────────────────────────

def _send_raw(cfg: dict, to_email: str, subject: str, body_html: str,
              attachments: list[tuple[bytes, str, str]] | None = None,
              inline_images: dict[str, Path] | None = None) -> None:
    """attachments: list of (bytes, content_type, filename)
    inline_images: dict de {cid: ruta_archivo_png} referenciadas en el HTML como cid:<cid>"""
    # Outer envelope: mixed (allows both inline images and file attachments)
    msg = MIMEMultipart('mixed')
    msg['Subject'] = subject
    msg['From'] = cfg['from']
    msg['To'] = to_email

    # related: html body + imágenes inline vía CID
    related = MIMEMultipart('related')
    related.attach(MIMEText(body_html, 'html', 'utf-8'))

    all_inline = {'logo': _LOGO_PATH, **(inline_images or {})}
    for cid, path in all_inline.items():
        if path.exists():
            with open(path, 'rb') as f:
                img = MIMEImage(f.read(), 'png')
            img.add_header('Content-ID', f'<{cid}>')
            img.add_header('Content-Disposition', 'inline', filename=f'{cid}.png')
            related.attach(img)

    msg.attach(related)

    for data, ctype, fname in (attachments or []):
        main_type, sub_type = ctype.split('/', 1)
        part = MIMEBase(main_type, sub_type)
        part.set_payload(data)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', 'attachment', filename=fname)
        msg.attach(part)

    host, port, user, password, use_tls = (
        cfg['host'], cfg['port'], cfg['user'], cfg['password'], cfg['use_tls']
    )

    if use_tls and port == 465:
        with smtplib.SMTP_SSL(host, port) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port) as smtp:
            smtp.ehlo()
            try:
                smtp.starttls()
                smtp.ehlo()
            except smtplib.SMTPException:
                pass
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)


# ─── Funciones públicas ───────────────────────────────────────────────────────

async def send_test_email(db: AsyncSession, *, to_email: str) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        raise ValueError("SMTP no configurado")

    subject, html = _render('test.html')
    try:
        _send_raw(cfg, to_email, subject, html)
        await _write_log(db, to_email, subject, 'ok')
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        raise


async def send_welcome(db: AsyncSession, *, to_email: str, name: str, setup_token: str) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        logger.info("SMTP no configurado, omitiendo bienvenida a %s", to_email)
        return

    setup_url = f"{cfg['site_url']}/reset-password?token={setup_token}&type=setup"
    subject, html = _render('welcome.html', name=name, email=to_email,
                            setup_url=setup_url, expires_hours=72)
    try:
        _send_raw(cfg, to_email, subject, html, inline_images={'hero-acceso': _HERO_ACCESO_PATH})
        await _write_log(db, to_email, subject, 'ok')
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        logger.warning("Error enviando bienvenida a %s: %s", to_email, exc)


async def send_password_reset(db: AsyncSession, *, to_email: str, name: str, reset_token: str) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        logger.info("SMTP no configurado, omitiendo reset a %s", to_email)
        return

    reset_url = f"{cfg['site_url']}/reset-password?token={reset_token}"
    subject, html = _render('password_reset.html', name=name,
                            reset_url=reset_url, expires_minutes=60)
    try:
        _send_raw(cfg, to_email, subject, html, inline_images={'hero-acceso': _HERO_ACCESO_PATH})
        await _write_log(db, to_email, subject, 'ok')
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        logger.warning("Error enviando reset a %s: %s", to_email, exc)


async def send_otp(db: AsyncSession, *, to_email: str, name: str, otp_code: str) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        raise ValueError("SMTP no configurado")

    subject, html = _render('otp.html', name=name, otp_code=otp_code, expires_minutes=10)
    try:
        _send_raw(cfg, to_email, subject, html)
        await _write_log(db, to_email, subject, 'ok')
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        raise


async def send_password_changed(
    db: AsyncSession,
    *,
    to_email: str,
    name: str,
    by_admin: bool = False,
) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        logger.info("SMTP no configurado, omitiendo aviso de contraseña cambiada a %s", to_email)
        return

    from datetime import datetime
    changed_at = datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')
    subject, html = _render('password_changed.html', name=name,
                            by_admin=by_admin, changed_at=changed_at)
    try:
        _send_raw(cfg, to_email, subject, html)
        await _write_log(db, to_email, subject, 'ok')
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        logger.warning("Error enviando aviso de contraseña cambiada a %s: %s", to_email, exc)


async def send_period_reopened(
    db: AsyncSession,
    *,
    to_email: str,
    user_name: str,
    year: int,
    month: int,
) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        logger.info("SMTP no configurado, omitiendo aviso de reapertura")
        return

    _MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    period_label = f'{_MONTHS[month]} {year}'

    from datetime import datetime
    reopened_at = datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')
    subject, html = _render('period_reopened.html', name=user_name,
                            period_label=period_label, reopened_at=reopened_at)
    try:
        _send_raw(cfg, to_email, subject, html)
        await _write_log(db, to_email, subject, 'ok')
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        logger.warning("Error enviando aviso de reapertura a %s: %s", to_email, exc)


async def send_daily_reminder(
    db: AsyncSession,
    *,
    to_email: str,
    user_name: str,
    tomorrow,
    expense_items: list[dict],
    income_items: list[dict],
    total_expenses: str | None,
    total_incomes: str | None,
) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        logger.info("SMTP no configurado, omitiendo recordatorio para %s", to_email)
        return

    _MONTHS = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    date_label = f"{tomorrow.day} de {_MONTHS[tomorrow.month]} de {tomorrow.year}"

    subject, html = _render(
        'daily_reminder.html',
        name=user_name,
        date_label=date_label,
        expense_items=expense_items,
        income_items=income_items,
        total_expenses=total_expenses,
        total_incomes=total_incomes,
    )
    try:
        _send_raw(cfg, to_email, subject, html)
        await _write_log(db, to_email, subject, 'ok')
        logger.info("Recordatorio diario enviado a %s (%d egresos, %d ingresos)",
                    to_email, len(expense_items), len(income_items))
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        logger.warning("Error enviando recordatorio a %s: %s", to_email, exc)


async def send_period_report(
    db: AsyncSession,
    *,
    to_email: str,
    user_name: str,
    year: int,
    month: int,
    pdf_bytes: bytes,
    total_incomes_fmt: str,
    total_expenses_fmt: str,
    balance_fmt: str,
    balance_positive: bool,
) -> None:
    cfg = await _load_smtp(db)
    if not cfg['host']:
        logger.info("SMTP no configurado, omitiendo reporte de período")
        return

    _MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    period_label = f'{_MONTHS[month]} {year}'
    subject, html = _render(
        'period_report.html',
        name=user_name,
        period_label=period_label,
        total_incomes=total_incomes_fmt,
        total_expenses=total_expenses_fmt,
        balance=balance_fmt,
        balance_positive=balance_positive,
    )
    pdf_name = f'reporte_{year}_{month:02d}.pdf'
    try:
        _send_raw(cfg, to_email, subject, html,
                  attachments=[(pdf_bytes, 'application/pdf', pdf_name)])
        await _write_log(db, to_email, subject, 'ok')
        logger.info("Reporte de período enviado a %s", to_email)
    except Exception as exc:
        await _write_log(db, to_email, subject, 'error', str(exc))
        logger.warning("Error enviando reporte a %s: %s", to_email, exc)

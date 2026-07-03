"""
Panel de administración — /api/v1/admin/

Endpoints:
  - Usuarios: crear, listar, activar/desactivar, cambiar rol
  - Catálogos de sistema: agregar, editar categorías e income_types globales
  - Tokens de ingesta: vista global (los usuarios gestionan los suyos en /ingestion-tokens)

Requiere is_admin=True en el usuario autenticado.
"""
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.auth.dependencies import get_current_admin
from app.auth.rate_limit import rate_limit
from app.database import get_db
from app.routers.auth import _set_refresh_cookie
from app.models.user import User
from app.models.catalog import Category, IncomeType
from app.models.ingestion import IngestionToken
from app.models.period import Period, PeriodStatus
from app.models.settings import AppSetting
from app.models.email_log import EmailLog
from app.models.password_reset import PasswordResetToken, TokenType
from app.auth.jwt import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.services import email as email_service
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/admin", tags=["admin"])

_admin_login_limit = rate_limit(max_calls=5, window_seconds=60)

# Cookie de refresh separada de la de usuario regular — evita que iniciar
# sesión en el panel admin invalide silenciosamente la sesión de usuario
# (y viceversa) cuando ambas se usan en el mismo navegador.
ADMIN_REFRESH_COOKIE_NAME = "cg_admin_refresh"
ADMIN_REFRESH_COOKIE_PATH = "/api/v1/admin"


# ─── Auth de administrador ────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False

_BOOTSTRAP_PASSWORD = "admin"


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(_admin_login_limit)])
async def admin_login(body: AdminLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # Modo bootstrap: si no existe ningún administrador, se permite crear el primero
    # con cualquier email y la contraseña "admin", forzando cambio inmediato.
    admin_count = (await db.execute(
        select(func.count()).select_from(User).where(User.is_admin.is_(True))
    )).scalar() or 0

    if admin_count == 0:
        if body.password != _BOOTSTRAP_PASSWORD:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
        name = body.email.split('@')[0].capitalize()
        user = User(
            email=body.email,
            password_hash=hash_password(body.password),
            name=name,
            is_admin=True,
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
        if not user or not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta desactivada")
        if not user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido a administradores")

    user.last_login_at = datetime.utcnow()
    await db.commit()

    _set_refresh_cookie(
        response, create_refresh_token(user.id, user.token_version),
        cookie_name=ADMIN_REFRESH_COOKIE_NAME, path=ADMIN_REFRESH_COOKIE_PATH,
    )
    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        must_change_password=getattr(user, 'must_change_password', False),
    )


@router.post("/refresh", response_model=TokenResponse)
async def admin_refresh(
    response: Response,
    db: AsyncSession = Depends(get_db),
    cg_admin_refresh: str | None = Cookie(default=None),
):
    from jose import JWTError
    try:
        payload = decode_token(cg_admin_refresh or "")
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = uuid.UUID(payload["sub"])
        token_ver = payload.get("ver")
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.is_active or not user.is_admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no válido")
    if token_ver is None or token_ver != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión expirada. Inicia sesión nuevamente.")

    _set_refresh_cookie(
        response, create_refresh_token(user.id, user.token_version),
        cookie_name=ADMIN_REFRESH_COOKIE_NAME, path=ADMIN_REFRESH_COOKIE_PATH,
    )
    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        must_change_password=getattr(user, 'must_change_password', False),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def admin_logout(response: Response):
    response.delete_cookie(key=ADMIN_REFRESH_COOKIE_NAME, path=ADMIN_REFRESH_COOKIE_PATH)


# ─── Schemas inline (mínimos para el admin) ──────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: str | None = None
    is_admin: bool | None = None
    is_active: bool | None = None
    password: str | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None = None
    periods_open: int = 0
    periods_closed: int = 0


class SystemCategoryCreate(BaseModel):
    name: str
    type: str  # recurrente | puntual
    default_obviable: bool = False
    description: str | None = None
    default_active: bool = True


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    default_obviable: bool
    description: str | None
    default_active: bool

    model_config = {"from_attributes": True}


class SystemIncomeTypeCreate(BaseModel):
    name: str
    default_active: bool = True


class IncomeTypeOut(BaseModel):
    id: uuid.UUID
    name: str
    default_active: bool

    model_config = {"from_attributes": True}


# ─── Usuarios ────────────────────────────────────────────────────────────────

async def _period_counts(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, int]:
    open_count = (await db.execute(
        select(func.count()).select_from(Period)
        .where(Period.user_id == user_id, Period.status == PeriodStatus.abierto)
    )).scalar() or 0
    closed_count = (await db.execute(
        select(func.count()).select_from(Period)
        .where(Period.user_id == user_id, Period.status == PeriodStatus.cerrado)
    )).scalar() or 0
    return open_count, closed_count


def _user_out(user: User, periods_open: int = 0, periods_closed: int = 0) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=getattr(user, 'last_login_at', None),
        periods_open=periods_open,
        periods_closed=periods_closed,
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    open_sq = (
        select(func.count()).select_from(Period)
        .where(Period.user_id == User.id, Period.status == PeriodStatus.abierto)
        .scalar_subquery()
    )
    closed_sq = (
        select(func.count()).select_from(Period)
        .where(Period.user_id == User.id, Period.status == PeriodStatus.cerrado)
        .scalar_subquery()
    )
    rows = (await db.execute(
        select(User, open_sq.label('periods_open'), closed_sq.label('periods_closed'))
        .order_by(User.created_at)
    )).all()
    return [_user_out(u, po, pc) for u, po, pc in rows]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    raw_smtp = await _load_raw_smtp(db)
    if not raw_smtp.get('smtp_host'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configure el servidor de correo (SMTP) antes de crear usuarios",
        )

    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya está registrado")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        is_admin=body.is_admin,
        timezone="America/Santiago",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Generar token de configuración y enviar bienvenida (no-fatal)
    try:
        setup_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(setup_token.encode()).hexdigest()
        db.add(PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            token_type=TokenType.setup,
            expires_at=datetime.utcnow() + timedelta(hours=72),
        ))
        await db.commit()
        await email_service.send_welcome(
            db, to_email=user.email, name=user.name, setup_token=setup_token
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("No se pudo enviar bienvenida a %s: %s", user.email, exc)

    return _user_out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if user.id == admin.id and body.is_admin is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes quitarte el rol de admin a ti mismo")

    if body.name is not None:
        user.name = body.name
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active
    password_changed = body.password is not None
    if password_changed:
        user.password_hash = hash_password(body.password)
        user.token_version = (user.token_version or 0) + 1

    await db.commit()
    await db.refresh(user)

    if password_changed and user.is_active:
        await email_service.send_password_changed(
            db, to_email=user.email, name=user.name, by_admin=True
        )

    po, pc = await _period_counts(db, user.id)
    return _user_out(user, po, pc)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes eliminarte a ti mismo")
    if user.is_admin:
        admin_count = (await db.execute(
            select(func.count()).select_from(User).where(User.is_admin.is_(True))
        )).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede eliminar al único administrador del sistema",
            )
    has_periods = (await db.execute(
        select(Period).where(Period.user_id == user_id).limit(1)
    )).scalar_one_or_none()
    if has_periods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar un usuario con períodos registrados",
        )
    await db.delete(user)
    await db.commit()


# ─── Catálogos de sistema ─────────────────────────────────────────────────────

@router.get("/system-categories", response_model=list[CategoryOut])
async def list_system_categories(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(Category).where(Category.is_system.is_(True)).order_by(Category.type, Category.name)
    )
    return result.scalars().all()


@router.post("/system-categories", status_code=status.HTTP_201_CREATED)
async def create_system_category(
    body: SystemCategoryCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    cat = Category(is_system=True, user_id=None, **body.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.patch("/system-categories/{category_id}")
async def update_system_category(
    category_id: uuid.UUID,
    body: SystemCategoryCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    cat = (await db.execute(
        select(Category).where(Category.id == category_id, Category.is_system.is_(True))
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría de sistema no encontrada")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.post("/system-income-types", status_code=status.HTTP_201_CREATED)
async def create_system_income_type(
    body: SystemIncomeTypeCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    it = IncomeType(is_system=True, user_id=None, **body.model_dump())
    db.add(it)
    await db.commit()
    await db.refresh(it)
    return it


@router.get("/system-income-types", response_model=list[IncomeTypeOut])
async def list_system_income_types(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(IncomeType).where(IncomeType.is_system.is_(True)).order_by(IncomeType.name)
    )
    return result.scalars().all()


@router.patch("/system-income-types/{income_type_id}", response_model=IncomeTypeOut)
async def update_system_income_type(
    income_type_id: uuid.UUID,
    body: SystemIncomeTypeCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    it = (await db.execute(
        select(IncomeType).where(IncomeType.id == income_type_id, IncomeType.is_system.is_(True))
    )).scalar_one_or_none()
    if not it:
        raise HTTPException(status_code=404, detail="Tipo de ingreso no encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(it, field, value)
    await db.commit()
    await db.refresh(it)
    return it


# ─── Tokens de ingesta (vista global) ────────────────────────────────────────

class IngestionTokenOut(BaseModel):
    id: uuid.UUID
    label: str
    active: bool
    created_at: str
    last_used_at: str | None
    user_id: uuid.UUID
    user_name: str
    user_email: str

    model_config = {"from_attributes": True}


@router.get("/ingestion-tokens", response_model=list[IngestionTokenOut])
async def list_all_ingestion_tokens(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(IngestionToken, User.name, User.email)
        .join(User, User.id == IngestionToken.user_id)
        .order_by(IngestionToken.created_at.desc())
    )
    return [
        {
            "id": t.id,
            "label": t.label,
            "active": t.active,
            "created_at": t.created_at.isoformat(),
            "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
            "user_id": t.user_id,
            "user_name": name,
            "user_email": email,
        }
        for t, name, email in result.all()
    ]


# ─── Configuración General ───────────────────────────────────────────────────

class GeneralSettingsOut(BaseModel):
    site_url: str


class GeneralSettingsIn(BaseModel):
    site_url: str = ''


@router.get("/settings/general", response_model=GeneralSettingsOut)
async def get_general_settings(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = (await db.execute(select(AppSetting).where(AppSetting.key == 'site_url'))).scalar_one_or_none()
    return GeneralSettingsOut(site_url=result.value if result else '')


@router.put("/settings/general", response_model=GeneralSettingsOut)
async def update_general_settings(
    body: GeneralSettingsIn,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    existing = (await db.execute(select(AppSetting).where(AppSetting.key == 'site_url'))).scalar_one_or_none()
    if existing:
        existing.value = body.site_url.rstrip('/')
    else:
        db.add(AppSetting(key='site_url', value=body.site_url.rstrip('/')))
    await db.commit()
    return GeneralSettingsOut(site_url=body.site_url.rstrip('/'))


# ─── Configuración SMTP ──────────────────────────────────────────────────────

_SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_use_tls']


class SmtpSettingsOut(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str  # devolvemos vacío si existe, no el valor real
    smtp_from: str
    smtp_use_tls: bool


class SmtpSettingsIn(BaseModel):
    smtp_host: str = ''
    smtp_port: int = 587
    smtp_user: str = ''
    smtp_password: str = ''
    smtp_from: str = ''
    smtp_use_tls: bool = True


class SmtpTestRequest(BaseModel):
    to_email: EmailStr


async def _load_raw_smtp(db: AsyncSession) -> dict:
    result = await db.execute(select(AppSetting).where(AppSetting.key.in_(_SMTP_KEYS)))
    return {row.key: (row.value or '') for row in result.scalars().all()}


@router.get("/settings/smtp", response_model=SmtpSettingsOut)
async def get_smtp_settings(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    raw = await _load_raw_smtp(db)
    return SmtpSettingsOut(
        smtp_host=raw.get('smtp_host', ''),
        smtp_port=int(raw.get('smtp_port') or 587),
        smtp_user=raw.get('smtp_user', ''),
        smtp_password='*****' if raw.get('smtp_password') else '',
        smtp_from=raw.get('smtp_from', ''),
        smtp_use_tls=(raw.get('smtp_use_tls') or 'true').lower() not in ('false', '0', 'no'),
    )


@router.put("/settings/smtp", response_model=SmtpSettingsOut)
async def update_smtp_settings(
    body: SmtpSettingsIn,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    updates = {
        'smtp_host': body.smtp_host,
        'smtp_port': str(body.smtp_port),
        'smtp_user': body.smtp_user,
        'smtp_from': body.smtp_from,
        'smtp_use_tls': 'true' if body.smtp_use_tls else 'false',
    }
    # Solo actualizar contraseña si viene un valor nuevo (no el placeholder)
    if body.smtp_password and body.smtp_password != '*****':
        updates['smtp_password'] = body.smtp_password

    for key, value in updates.items():
        existing = (await db.execute(select(AppSetting).where(AppSetting.key == key))).scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))

    await db.commit()

    raw = await _load_raw_smtp(db)
    return SmtpSettingsOut(
        smtp_host=raw.get('smtp_host', ''),
        smtp_port=int(raw.get('smtp_port') or 587),
        smtp_user=raw.get('smtp_user', ''),
        smtp_password='*****' if raw.get('smtp_password') else '',
        smtp_from=raw.get('smtp_from', ''),
        smtp_use_tls=(raw.get('smtp_use_tls') or 'true').lower() not in ('false', '0', 'no'),
    )


@router.post("/settings/smtp/test", status_code=200)
async def test_smtp(
    body: SmtpTestRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    try:
        await email_service.send_test_email(db, to_email=str(body.to_email))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error enviando email: {exc}")
    return {"detail": "Email de prueba enviado correctamente"}


# ─── Log de emails ───────────────────────────────────────────────────────────

class EmailLogOut(BaseModel):
    id: uuid.UUID
    sent_at: str
    to_email: str
    subject: str
    status: str
    error_msg: str | None

    model_config = {"from_attributes": True}


@router.get("/email-logs", response_model=list[EmailLogOut])
async def list_email_logs(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
    date_from: str | None = None,
    date_to: str | None = None,
    recipient: str | None = None,
):
    from sqlalchemy import and_

    # Default: últimos 15 días. date_to incluye todo el día (hasta las 23:59:59).
    if date_to:
        _dt_to = datetime.fromisoformat(date_to)
        # Si vino solo fecha (sin hora), avanzar al final del día
        if _dt_to.hour == 0 and _dt_to.minute == 0 and _dt_to.second == 0:
            _dt_to = _dt_to.replace(hour=23, minute=59, second=59)
        dt_to = _dt_to
    else:
        dt_to = datetime.utcnow()
    dt_from = datetime.fromisoformat(date_from) if date_from else dt_to - timedelta(days=15)

    filters = [
        EmailLog.sent_at >= dt_from,
        EmailLog.sent_at <= dt_to,
    ]
    if recipient:
        filters.append(EmailLog.to_email.ilike(f"%{recipient}%"))

    result = await db.execute(
        select(EmailLog)
        .where(and_(*filters))
        .order_by(EmailLog.sent_at.desc())
        .limit(500)
    )
    return [
        EmailLogOut(
            id=row.id,
            sent_at=row.sent_at.isoformat(),
            to_email=row.to_email,
            subject=row.subject,
            status=row.status,
            error_msg=row.error_msg,
        )
        for row in result.scalars().all()
    ]


# ─── Configuración de recordatorios ─────────────────────────────────────────

_REMINDER_KEYS = ["reminder_enabled"]


class ReminderSettingsOut(BaseModel):
    enabled: bool


class ReminderSettingsIn(BaseModel):
    enabled: bool = True


@router.get("/settings/reminder", response_model=ReminderSettingsOut)
async def get_reminder_settings(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = (await db.execute(
        select(AppSetting).where(AppSetting.key.in_(_REMINDER_KEYS))
    )).scalars().all()
    raw = {r.key: r.value for r in rows}

    enabled = (raw.get("reminder_enabled") or "true").lower() not in ("false", "0", "no")
    return ReminderSettingsOut(enabled=enabled)


@router.post("/settings/reminder/test", status_code=202)
async def test_reminder(
    background_tasks: BackgroundTasks,
    _admin: User = Depends(get_current_admin),
):
    """Fuerza una ejecución inmediata del recordatorio diario (en segundo plano)."""
    from app.workers.reminder_worker import run_daily_reminder
    background_tasks.add_task(run_daily_reminder)
    return {"detail": "Recordatorio diario en ejecución"}


@router.put("/settings/reminder", response_model=ReminderSettingsOut)
async def update_reminder_settings(
    body: ReminderSettingsIn,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    existing = (await db.execute(
        select(AppSetting).where(AppSetting.key == "reminder_enabled")
    )).scalar_one_or_none()
    if existing:
        existing.value = "true" if body.enabled else "false"
    else:
        db.add(AppSetting(key="reminder_enabled", value="true" if body.enabled else "false"))
    await db.commit()

    return ReminderSettingsOut(enabled=body.enabled)


class IngestionTokenCreate(BaseModel):
    user_id: uuid.UUID
    label: str


@router.post("/ingestion-tokens", status_code=201)
async def create_ingestion_token(
    body: IngestionTokenCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    import hashlib, secrets as _secrets
    user = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    raw_token = _secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    token = IngestionToken(user_id=body.user_id, token_hash=token_hash, label=body.label)
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return {
        "id": token.id,
        "label": token.label,
        "active": token.active,
        "created_at": token.created_at.isoformat(),
        "last_used_at": None,
        "user_id": token.user_id,
        "user_name": user.name,
        "user_email": user.email,
        "token": raw_token,
    }


@router.patch("/ingestion-tokens/{token_id}", response_model=IngestionTokenOut)
async def toggle_ingestion_token(
    token_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(IngestionToken, User.name, User.email)
        .join(User, User.id == IngestionToken.user_id)
        .where(IngestionToken.id == token_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Token no encontrado")
    t, name, email = row
    if not t.active:
        raise HTTPException(status_code=409, detail="Un token revocado no puede reactivarse")
    t.active = False
    await db.commit()
    await db.refresh(t)
    return {
        "id": t.id,
        "label": t.label,
        "active": t.active,
        "created_at": t.created_at.isoformat(),
        "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
        "user_id": t.user_id,
        "user_name": name,
        "user_email": email,
    }

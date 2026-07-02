"""
Recuperación de contraseña — /api/v1/auth/
  POST /forgot-password   → genera OTP + envía email
  POST /verify-otp        → valida OTP + devuelve token de reset
  POST /reset-password    → valida token + actualiza contraseña
"""
import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.auth.rate_limit import rate_limit

_recovery_limit = rate_limit(max_calls=5, window_seconds=300)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.user import User
from app.models.password_reset import PasswordResetToken, TokenType
from app.auth.jwt import hash_password
from app.services import email as email_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _gen_link_token() -> str:
    return secrets.token_urlsafe(32)


def _gen_otp() -> str:
    return str(secrets.randbelow(900000) + 100000)


# ─── Forgot password (envía OTP) ──────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(_recovery_limit)])
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(
        select(User).where(User.email == body.email, User.is_active.is_(True))
    )).scalar_one_or_none()

    # Siempre responde 202 para no revelar si el email existe
    if not user:
        return {"detail": "Si el correo existe, recibirás el código en breve"}

    # Invalidar OTPs previos del mismo usuario
    existing = (await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.token_type == TokenType.otp,
            PasswordResetToken.used_at.is_(None),
        )
    )).scalars().all()
    for t in existing:
        t.used_at = datetime.utcnow()

    otp = _gen_otp()
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(otp),
        token_type=TokenType.otp,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    ))
    await db.commit()

    await email_service.send_otp(
        db, to_email=user.email, name=user.name, otp_code=otp
    )
    return {"detail": "Si el correo existe, recibirás el código en breve"}


# ─── Verify OTP ───────────────────────────────────────────────────────────────

class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str


@router.post("/verify-otp", status_code=status.HTTP_200_OK, dependencies=[Depends(_recovery_limit)])
async def verify_otp(body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(
        select(User).where(User.email == body.email, User.is_active.is_(True))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    otp_hash = _hash_token(body.otp)
    record = (await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.token_hash == otp_hash,
            PasswordResetToken.token_type == TokenType.otp,
            PasswordResetToken.used_at.is_(None),
        )
    )).scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=400, detail="Código inválido o expirado")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="El código ha expirado")

    # Marcar OTP como usado
    record.used_at = datetime.utcnow()

    # Generar token de reset de corta duración
    reset_token = _gen_link_token()
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(reset_token),
        token_type=TokenType.reset,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    ))
    await db.commit()

    return {"reset_token": reset_token}


# ─── Reset password ───────────────────────────────────────────────────────────

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    token_hash = _hash_token(body.token)
    record = (await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
    )).scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=400, detail="Enlace inválido o ya utilizado")
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="El enlace ha expirado")

    user = (await db.execute(
        select(User).where(User.id == record.user_id, User.is_active.is_(True))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Usuario no encontrado")

    user.password_hash = hash_password(body.new_password)
    user.token_version = (user.token_version or 0) + 1
    user.must_change_password = False
    record.used_at = datetime.utcnow()
    await db.commit()

    await email_service.send_password_changed(
        db, to_email=user.email, name=user.name, by_admin=False
    )
    return {"detail": "Contraseña actualizada correctamente"}


# ─── Validate token (para el flujo de setup de cuenta nueva) ──────────────────

class ValidateTokenRequest(BaseModel):
    token: str


@router.post("/validate-reset-token", status_code=status.HTTP_200_OK)
async def validate_reset_token(body: ValidateTokenRequest, db: AsyncSession = Depends(get_db)):
    token_hash = _hash_token(body.token)
    record = (await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
    )).scalar_one_or_none()

    if not record or record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Enlace inválido o expirado")

    return {"valid": True, "type": record.token_type.value}

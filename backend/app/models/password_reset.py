import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SAEnum, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from app.models.base import Base, created_at_col

if __import__('typing').TYPE_CHECKING:
    from app.models.user import User


class TokenType(str, enum.Enum):
    reset = "reset"   # recuperación de contraseña (link)
    setup = "setup"   # cuenta nueva, configurar contraseña (link)
    otp   = "otp"     # código de 6 dígitos


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        Index("ix_prt_user_id", "user_id"),
        Index("ix_prt_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    token_type: Mapped[TokenType] = mapped_column(
        SAEnum(TokenType, name="token_type"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    user: Mapped["User"] = relationship("User")

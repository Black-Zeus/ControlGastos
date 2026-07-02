import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.user import User


class IngestionToken(Base):
    """
    Token que permite a sistemas externos (bots, automatizaciones) publicar
    recibos en el endpoint de ingesta. Resuelve a un user_id específico.
    El token en claro nunca se almacena; solo el hash.
    """
    __tablename__ = "ingestion_tokens"
    __table_args__ = (
        Index("ix_ingestion_tokens_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = created_at_col()
    last_used_at: Mapped[datetime | None] = mapped_column(nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="ingestion_tokens")

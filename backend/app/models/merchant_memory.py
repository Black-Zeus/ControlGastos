import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.catalog import Category


class MerchantCategoryMemory(Base):
    """
    Aprendizaje simple por usuario: qué categoría se terminó eligiendo para
    boletas cuyo texto OCR contiene tal palabra clave de comercio (p. ej.
    "uber" → Transporte). Se refuerza cada vez que el usuario confirma un
    recibo de ingesta (ver app.routers.ingestion.confirm_receipt); se
    consulta antes que la heurística genérica de app.services.receipt_parsing.
    """
    __tablename__ = "merchant_category_memory"
    __table_args__ = (
        UniqueConstraint("user_id", "merchant_keyword", name="uq_merchant_memory_user_keyword"),
        Index("ix_merchant_memory_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    merchant_keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_used_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = created_at_col()

    user: Mapped["User"] = relationship("User")
    category: Mapped["Category"] = relationship("Category")

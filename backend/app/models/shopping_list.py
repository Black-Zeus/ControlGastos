import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, Numeric, Integer, ForeignKey, Index, func, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.catalog import Category


class ShoppingList(Base):
    """Lista de compra reutilizable — sobrevive al envío a egreso (ver send-to-expense)."""

    __tablename__ = "shopping_lists"
    __table_args__ = (
        Index("ix_shopping_lists_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    default_category_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User")
    default_category: Mapped["Category | None"] = relationship("Category")
    items: Mapped[list["ShoppingListItem"]] = relationship(
        back_populates="shopping_list",
        cascade="all, delete-orphan",
        order_by="ShoppingListItem.position",
    )


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"
    __table_args__ = (
        Index("ix_shopping_list_items_list_id", "shopping_list_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    shopping_list_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # Cantidad y precio unitario son la fuente de verdad — el total se calcula (quantity * unit_price),
    # nunca se guarda como campo aparte, para que "editar" siempre recupere los valores reales.
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    purchased: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # No es obligatorio comprarlo (mismo concepto que Expense.obviable).
    obviable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Marcado cuando el ítem ya fue incluido en un envío a egreso — evita que un segundo
    # "enviar a egreso" sin reiniciar la lista vuelva a cobrar el mismo producto.
    sent_at: Mapped[datetime | None] = mapped_column(nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    shopping_list: Mapped["ShoppingList"] = relationship("ShoppingList", back_populates="items")

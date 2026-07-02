"""
Catálogos del sistema con pool compartido + configuración por usuario.

Reglas:
  - is_system=True  → user_id=None   (categoría de sistema, no eliminable por usuarios)
  - is_system=False → user_id=<uuid> (categoría propia del usuario, eliminable)

  Activación de categorías de sistema: via UserCategoryConfig.
    - Si existe UserCategoryConfig(user_id, category_id): usa ese valor.
    - Si no existe: hereda Category.default_active.

  Categorías propias del usuario: Category.active controla su estado directamente.
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import (
    String, Boolean, Text, Enum as SAEnum,
    ForeignKey, CheckConstraint, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import enum

from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.transaction import Expense, Income


class CategoryType(str, enum.Enum):
    recurrente = "recurrente"
    puntual = "puntual"


# ─────────────────────────────────────────────────────────────────────────────
# Categorías de Egreso
# ─────────────────────────────────────────────────────────────────────────────

class Category(Base):
    """
    Pool unificado de categorías de egreso.

    Registros con is_system=True son el catálogo global (seed).
    Registros con is_system=False son categorías propias de un usuario.
    """
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint(
            "(is_system = true AND user_id IS NULL) OR (is_system = false AND user_id IS NOT NULL)",
            name="ck_categories_system_xor_user",
        ),
        Index("ix_categories_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[CategoryType] = mapped_column(
        SAEnum(CategoryType, name="category_type"), nullable=False, default=CategoryType.puntual
    )
    default_obviable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Para categorías de sistema: activo por defecto para nuevos usuarios.
    # Para categorías propias: estado activo del usuario.
    default_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = created_at_col()

    # Relations
    owner: Mapped["User | None"] = relationship(
        "User", back_populates="custom_categories", foreign_keys=[user_id]
    )
    user_configs: Mapped[list["UserCategoryConfig"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )
    expenses: Mapped[list["Expense"]] = relationship(back_populates="category")


class UserCategoryConfig(Base):
    """
    Override por usuario para categorías de sistema.
    Solo se crea cuando el usuario modifica el estado por defecto.
    """
    __tablename__ = "user_category_configs"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", name="uq_user_category_config"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, primary_key=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False, primary_key=True,
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="category_configs")
    category: Mapped["Category"] = relationship("Category", back_populates="user_configs")


# ─────────────────────────────────────────────────────────────────────────────
# Tipos de Ingreso
# ─────────────────────────────────────────────────────────────────────────────

class IncomeType(Base):
    """Pool unificado de tipos de ingreso. Mismo patrón que Category."""
    __tablename__ = "income_types"
    __table_args__ = (
        CheckConstraint(
            "(is_system = true AND user_id IS NULL) OR (is_system = false AND user_id IS NOT NULL)",
            name="ck_income_types_system_xor_user",
        ),
        Index("ix_income_types_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    default_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = created_at_col()

    owner: Mapped["User | None"] = relationship(
        "User", back_populates="custom_income_types", foreign_keys=[user_id]
    )
    user_configs: Mapped[list["UserIncomeTypeConfig"]] = relationship(
        back_populates="income_type", cascade="all, delete-orphan"
    )
    incomes: Mapped[list["Income"]] = relationship(back_populates="income_type")


class UserIncomeTypeConfig(Base):
    """Override por usuario para tipos de ingreso de sistema."""
    __tablename__ = "user_income_type_configs"
    __table_args__ = (
        UniqueConstraint("user_id", "income_type_id", name="uq_user_income_type_config"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, primary_key=True,
    )
    income_type_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("income_types.id", ondelete="CASCADE"),
        nullable=False, primary_key=True,
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="income_type_configs")
    income_type: Mapped["IncomeType"] = relationship("IncomeType", back_populates="user_configs")

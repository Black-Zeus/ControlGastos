import uuid
import enum
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from sqlalchemy import (
    String, Boolean, Text, Numeric, Date,
    Enum as SAEnum, ForeignKey, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.catalog import Category, IncomeType
    from app.models.period import Period


class PaymentStatus(str, enum.Enum):
    pendiente = "pendiente"
    saldado = "saldado"


class IncomePaymentStatus(str, enum.Enum):
    recibido = "recibido"
    pendiente = "pendiente"


class ReviewStatus(str, enum.Enum):
    borrador = "borrador"
    confirmado = "confirmado"


class TransactionSource(str, enum.Enum):
    web = "web"
    ingestion = "ingestion"


class Income(Base):
    __tablename__ = "incomes"
    __table_args__ = (
        Index("ix_incomes_user_date", "user_id", "date"),
        Index("ix_incomes_period_id", "period_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("periods.id", ondelete="SET NULL"), nullable=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    income_type_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("income_types.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_status: Mapped[IncomePaymentStatus] = mapped_column(
        SAEnum(IncomePaymentStatus, name="income_payment_status"),
        nullable=False,
        default=IncomePaymentStatus.recibido,
    )
    carry_forward: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    responsible_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    user: Mapped["User"] = relationship("User", back_populates="incomes")
    income_type: Mapped["IncomeType"] = relationship("IncomeType", back_populates="incomes")
    period: Mapped["Period | None"] = relationship("Period", back_populates="incomes")


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_user_date", "user_id", "date"),
        Index("ix_expenses_user_review", "user_id", "review_status"),
        Index("ix_expenses_period_id", "period_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("periods.id", ondelete="SET NULL"), nullable=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    obviable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status"), nullable=False, default=PaymentStatus.pendiente
    )
    review_status: Mapped[ReviewStatus] = mapped_column(
        SAEnum(ReviewStatus, name="review_status"), nullable=False, default=ReviewStatus.confirmado
    )
    source: Mapped[TransactionSource] = mapped_column(
        SAEnum(TransactionSource, name="transaction_source"), nullable=False, default=TransactionSource.web
    )
    carry_forward: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsible_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    user: Mapped["User"] = relationship("User", back_populates="expenses")
    period: Mapped["Period | None"] = relationship("Period", back_populates="expenses")
    category: Mapped["Category"] = relationship("Category", back_populates="expenses")
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="expense", cascade="all, delete-orphan"
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = uuid_pk()
    expense_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    ocr_raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = created_at_col()

    expense: Mapped["Expense"] = relationship("Expense", back_populates="attachments")

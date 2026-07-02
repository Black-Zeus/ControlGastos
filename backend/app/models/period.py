import uuid
import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from sqlalchemy import (
    String, Text, Numeric, Integer, DateTime,
    Enum as SAEnum, ForeignKey, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.transaction import Expense, Income


class PeriodStatus(str, enum.Enum):
    abierto = "abierto"
    cerrado = "cerrado"


class Period(Base):
    __tablename__ = "periods"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", name="uq_period_user_year_month"),
        Index("ix_periods_user_id", "user_id"),
        Index("ix_periods_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PeriodStatus] = mapped_column(
        SAEnum(PeriodStatus, name="period_status"), nullable=False, default=PeriodStatus.abierto
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Snapshots calculados al cierre
    total_incomes: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    total_expenses: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    opened_at: Mapped[datetime] = created_at_col()
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    user: Mapped["User"] = relationship("User", back_populates="periods")
    expenses: Mapped[list["Expense"]] = relationship("Expense", back_populates="period")
    incomes: Mapped[list["Income"]] = relationship("Income", back_populates="period")

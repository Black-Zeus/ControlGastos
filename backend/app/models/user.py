import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, CheckConstraint, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.catalog import Category, IncomeType, UserCategoryConfig, UserIncomeTypeConfig
    from app.models.transaction import Income, Expense
    from app.models.ingestion import IngestionToken
    from app.models.period import Period


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CLP")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="America/Santiago")
    avatar_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    responsible_tags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default='[]')
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    receive_reminders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reminder_hour: Mapped[int] = mapped_column(
        Integer,
        CheckConstraint("reminder_hour >= 0 AND reminder_hour <= 23", name="ck_users_reminder_hour"),
        nullable=False,
        default=8,
    )
    created_at: Mapped[datetime] = created_at_col()

    # Relations
    custom_categories: Mapped[list["Category"]] = relationship(
        "Category",
        back_populates="owner",
        foreign_keys="Category.user_id",
    )
    category_configs: Mapped[list["UserCategoryConfig"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    custom_income_types: Mapped[list["IncomeType"]] = relationship(
        "IncomeType",
        back_populates="owner",
        foreign_keys="IncomeType.user_id",
    )
    income_type_configs: Mapped[list["UserIncomeTypeConfig"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    incomes: Mapped[list["Income"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    ingestion_tokens: Mapped[list["IngestionToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    periods: Mapped[list["Period"]] = relationship(back_populates="user", cascade="all, delete-orphan")

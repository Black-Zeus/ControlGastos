"""add carry_forward to expenses and incomes

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-01 22:00:00.000000
"""
from alembic import op

revision = 'a8b9c0d1e2f3'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS carry_forward BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE incomes  ADD COLUMN IF NOT EXISTS carry_forward BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE expenses DROP COLUMN IF EXISTS carry_forward")
    op.execute("ALTER TABLE incomes  DROP COLUMN IF EXISTS carry_forward")

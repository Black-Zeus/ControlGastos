"""add payment_status to incomes

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-01 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

revision = 'e6f7a8b9c0d1'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None

income_payment_status = PG_ENUM('recibido', 'pendiente', name='income_payment_status')


def upgrade() -> None:
    income_payment_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'incomes',
        sa.Column(
            'payment_status',
            sa.Enum('recibido', 'pendiente', name='income_payment_status'),
            nullable=False,
            server_default='recibido',
        ),
    )


def downgrade() -> None:
    op.drop_column('incomes', 'payment_status')
    income_payment_status.drop(op.get_bind(), checkfirst=True)

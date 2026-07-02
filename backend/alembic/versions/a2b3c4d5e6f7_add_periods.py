"""add periods table

Revision ID: a2b3c4d5e6f7
Revises: 825f8d850d47
Create Date: 2026-06-30 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = '825f8d850d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'periods',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('abierto', 'cerrado', name='period_status'), nullable=False, server_default='abierto'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('total_incomes', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('total_expenses', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('balance', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('opened_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'year', 'month', name='uq_period_user_year_month'),
    )
    op.create_index('ix_periods_user_id', 'periods', ['user_id'], unique=False)
    op.create_index('ix_periods_user_status', 'periods', ['user_id', 'status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_periods_user_status', table_name='periods')
    op.drop_index('ix_periods_user_id', table_name='periods')
    op.drop_table('periods')
    op.execute("DROP TYPE IF EXISTS period_status")

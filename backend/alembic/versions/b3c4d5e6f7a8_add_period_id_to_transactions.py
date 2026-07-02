"""add period_id to expenses and incomes

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-30 23:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('period_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_expenses_period_id', 'expenses', 'periods',
        ['period_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_expenses_period_id', 'expenses', ['period_id'], unique=False)

    op.add_column('incomes', sa.Column('period_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_incomes_period_id', 'incomes', 'periods',
        ['period_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_incomes_period_id', 'incomes', ['period_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_incomes_period_id', table_name='incomes')
    op.drop_constraint('fk_incomes_period_id', 'incomes', type_='foreignkey')
    op.drop_column('incomes', 'period_id')

    op.drop_index('ix_expenses_period_id', table_name='expenses')
    op.drop_constraint('fk_expenses_period_id', 'expenses', type_='foreignkey')
    op.drop_column('expenses', 'period_id')

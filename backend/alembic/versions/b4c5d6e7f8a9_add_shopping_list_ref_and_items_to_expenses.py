"""add shopping_list_id and items to expenses

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-04 00:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('shopping_list_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_expenses_shopping_list_id', 'expenses', 'shopping_lists',
        ['shopping_list_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_expenses_shopping_list_id', 'expenses', ['shopping_list_id'], unique=False)

    op.add_column(
        'expenses',
        sa.Column('items', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('expenses', 'items')

    op.drop_index('ix_expenses_shopping_list_id', table_name='expenses')
    op.drop_constraint('fk_expenses_shopping_list_id', 'expenses', type_='foreignkey')
    op.drop_column('expenses', 'shopping_list_id')

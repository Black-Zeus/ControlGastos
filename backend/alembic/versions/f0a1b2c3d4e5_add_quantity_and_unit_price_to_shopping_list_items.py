"""add quantity and unit_price to shopping_list_items

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, None] = 'e9f0a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shopping_list_items',
        sa.Column('quantity', sa.Numeric(10, 2), nullable=False, server_default='1'),
    )
    op.alter_column('shopping_list_items', 'quantity', server_default=None)
    op.alter_column('shopping_list_items', 'actual_amount', new_column_name='unit_price')
    op.drop_column('shopping_list_items', 'planned_amount')


def downgrade() -> None:
    op.add_column('shopping_list_items', sa.Column('planned_amount', sa.Numeric(14, 2), nullable=True))
    op.alter_column('shopping_list_items', 'unit_price', new_column_name='actual_amount')
    op.drop_column('shopping_list_items', 'quantity')

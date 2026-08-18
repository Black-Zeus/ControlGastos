"""add obviable to shopping_list_items

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-07-03 23:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e9f0a1b2c3d4'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shopping_list_items',
        sa.Column('obviable', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column('shopping_list_items', 'obviable', server_default=None)


def downgrade() -> None:
    op.drop_column('shopping_list_items', 'obviable')

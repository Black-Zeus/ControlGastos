"""add sent_at to shopping_list_items

Revision ID: d8e9f0a1b2c3
Revises: b4c5d6e7f8a9
Create Date: 2026-07-03 23:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = 'b4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shopping_list_items', sa.Column('sent_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('shopping_list_items', 'sent_at')

"""add observation to shopping_list_items

Revision ID: a4b5c6d7e8f9
Revises: f0a1b2c3d4e5
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a4b5c6d7e8f9'
down_revision: Union[str, None] = 'f0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shopping_list_items', sa.Column('observation', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('shopping_list_items', 'observation')

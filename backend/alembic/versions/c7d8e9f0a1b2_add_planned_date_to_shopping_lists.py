"""add planned_date to shopping_lists

Revision ID: c7d8e9f0a1b2
Revises: 315c19dda564
Create Date: 2026-10-02 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = '315c19dda564'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shopping_lists', sa.Column('planned_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('shopping_lists', 'planned_date')

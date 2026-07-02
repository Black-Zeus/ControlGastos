"""merge carry_forward with password_reset_tokens

Revision ID: 4c237e7095b0
Revises: a8b9c0d1e2f3, c3d4e5f6a7b8
Create Date: 2026-07-01 22:00:09.335903

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '4c237e7095b0'
down_revision: Union[str, None] = ('a8b9c0d1e2f3', 'c3d4e5f6a7b8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

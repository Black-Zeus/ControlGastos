"""merge reminders branch into main

Revision ID: d6e7f8a9b0c1
Revises: c2d3e4f5a6b7, c5d6e7f8a9b0
Create Date: 2026-07-02

"""
from typing import Union
from alembic import op

revision: str = 'd6e7f8a9b0c1'
down_revision: Union[tuple, None] = ('c2d3e4f5a6b7', 'c5d6e7f8a9b0')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""add receive_reminders to users

Revision ID: a0b1c2d3e4f5
Revises: f7a8b9c0d1e2
Create Date: 2026-07-02

"""
from alembic import op
import sqlalchemy as sa

revision = 'a0b1c2d3e4f5'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('receive_reminders', sa.Boolean(), nullable=False, server_default='true'),
    )


def downgrade() -> None:
    op.drop_column('users', 'receive_reminders')

"""add reminder_hour to users

Revision ID: c5d6e7f8a9b0
Revises: a0b1c2d3e4f5
Create Date: 2026-07-02

"""
from alembic import op
import sqlalchemy as sa

revision = 'c5d6e7f8a9b0'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('reminder_hour', sa.Integer(), nullable=False, server_default='8'),
    )
    op.create_check_constraint(
        'ck_users_reminder_hour',
        'users',
        'reminder_hour >= 0 AND reminder_hour <= 23',
    )


def downgrade() -> None:
    op.drop_constraint('ck_users_reminder_hour', 'users', type_='check')
    op.drop_column('users', 'reminder_hour')

"""add profile fields to users

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-06-30

"""
from alembic import op
import sqlalchemy as sa

revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('timezone', sa.String(50), nullable=False, server_default='UTC'))
    op.add_column('users', sa.Column('avatar_key', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_key')
    op.drop_column('users', 'timezone')

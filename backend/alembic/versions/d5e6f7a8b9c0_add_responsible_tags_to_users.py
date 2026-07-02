"""add responsible_tags to users

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'd5e6f7a8b9c0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('responsible_tags', JSONB, nullable=False, server_default='[]'))


def downgrade() -> None:
    op.drop_column('users', 'responsible_tags')

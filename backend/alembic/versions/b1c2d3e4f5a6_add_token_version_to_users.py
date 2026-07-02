"""add token_version to users

Revision ID: b1c2d3e4f5a6
Revises: 4c237e7095b0
Create Date: 2026-07-01 00:00:00.000000
"""
from alembic import op

revision = 'b1c2d3e4f5a6'
down_revision = '4c237e7095b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS token_version")

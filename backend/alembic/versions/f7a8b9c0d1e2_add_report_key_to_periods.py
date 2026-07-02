"""add report_key to periods

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-01 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f7a8b9c0d1e2'
down_revision = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'periods',
        sa.Column('report_key', sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('periods', 'report_key')

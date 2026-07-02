"""add email_logs table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-01 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'email_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('sent_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('to_email', sa.String(254), nullable=False),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('status', sa.String(10), nullable=False),
        sa.Column('error_msg', sa.Text(), nullable=True),
    )
    op.create_index('ix_email_logs_sent_at', 'email_logs', ['sent_at'])


def downgrade() -> None:
    op.drop_index('ix_email_logs_sent_at', 'email_logs')
    op.drop_table('email_logs')

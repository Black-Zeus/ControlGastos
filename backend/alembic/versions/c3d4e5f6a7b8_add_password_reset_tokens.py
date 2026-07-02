"""add password_reset_tokens table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-01 15:00:00.000000
"""
from alembic import op

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE token_type AS ENUM ('reset', 'setup', 'otp');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id            UUID         PRIMARY KEY,
            user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash    VARCHAR(64)  NOT NULL UNIQUE,
            token_type    token_type   NOT NULL,
            expires_at    TIMESTAMP    NOT NULL,
            used_at       TIMESTAMP,
            created_at    TIMESTAMP    NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_prt_user_id    ON password_reset_tokens (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_prt_expires_at ON password_reset_tokens (expires_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_prt_expires_at")
    op.execute("DROP INDEX IF EXISTS ix_prt_user_id")
    op.execute("DROP TABLE IF EXISTS password_reset_tokens")
    op.execute("DROP TYPE IF EXISTS token_type")

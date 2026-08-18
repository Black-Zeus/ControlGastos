"""add shopping lists

Revision ID: a3b4c5d6e7f8
Revises: e7f8a9b0c1d2
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'shopping_lists',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('default_category_id', sa.UUID(), nullable=True),
        sa.Column('archived', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['default_category_id'], ['categories.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_shopping_lists_user_id', 'shopping_lists', ['user_id'], unique=False)

    op.create_table(
        'shopping_list_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('shopping_list_id', sa.UUID(), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('planned_amount', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('purchased', sa.Boolean(), nullable=False),
        sa.Column('actual_amount', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['shopping_list_id'], ['shopping_lists.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_shopping_list_items_list_id', 'shopping_list_items', ['shopping_list_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_shopping_list_items_list_id', table_name='shopping_list_items')
    op.drop_table('shopping_list_items')

    op.drop_index('ix_shopping_lists_user_id', table_name='shopping_lists')
    op.drop_table('shopping_lists')

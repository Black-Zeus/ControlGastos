"""add items_from_list to expenses

Revision ID: 99e116fc4116
Revises: c7d8e9f0a1b2
Create Date: 2026-10-02 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '99e116fc4116'
down_revision: Union[str, None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'expenses',
        sa.Column('items_from_list', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    # Hasta esta versión la única forma de tener desglose era enviar una lista de compra
    # (el desglose manual llega en la misma versión), así que todo egreso con items viene de una.
    op.execute("UPDATE expenses SET items_from_list = true WHERE items IS NOT NULL")


def downgrade() -> None:
    op.drop_column('expenses', 'items_from_list')

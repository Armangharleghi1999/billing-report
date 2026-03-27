"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "statements",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("source", sa.String, nullable=False),
        sa.Column("filename", sa.String, nullable=False),
        sa.Column("period_start", sa.Date, nullable=True),
        sa.Column("period_end", sa.Date, nullable=True),
        sa.Column("imported_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("file_hash", sa.String, unique=True, nullable=False),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "statement_id", sa.Integer, sa.ForeignKey("statements.id"), nullable=False
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("description", sa.String, nullable=False),
        sa.Column("merchant", sa.String, nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String, default="USD"),
        sa.Column("category", sa.String, nullable=True),
        sa.Column("category_source", sa.String, default="rule"),
        sa.Column("is_credit", sa.Boolean, default=False),
        sa.Column("dedup_hash", sa.String, unique=True, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("transactions")
    op.drop_table("statements")

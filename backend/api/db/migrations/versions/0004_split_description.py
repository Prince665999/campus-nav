"""Split description into public + AI, on places, areas, and path_edges.

Revision ID: 0004
Revises: 0003

What this does:
  1. Renames the existing `description` column to `description_ai`
     on all three tables. Every value is preserved.
  2. Adds a new `description` column (public, empty) on all three.

The AI keeps reading the same text it read before — it just now lives
under `description_ai` instead of `description`.
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


_TABLES = ("places", "areas", "path_edges")


def upgrade():
    for table in _TABLES:
        # Rename the existing column. Its data stays put.
        op.alter_column(table, "description", new_column_name="description_ai")
        # Add the new public column, empty by default.
        op.add_column(table, sa.Column("description", sa.Text(), nullable=True))


def downgrade():
    for table in _TABLES:
        # Drop the public column.
        op.drop_column(table, "description")
        # Rename the AI column back to `description`.
        op.alter_column(table, "description_ai", new_column_name="description")
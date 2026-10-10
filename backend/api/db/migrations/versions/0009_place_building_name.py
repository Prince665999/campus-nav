"""Add building_name to places.

Revision ID: 0009
Revises: 0008

What this does:
  1. Adds `building_name` (nullable String) to places.
  2. Adds an index on it.

Existing rows get NULL. The next ingest run populates it for indoor
places and entrances. Outdoor places stay NULL — they have no
building.
"""

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "places",
        sa.Column("building_name", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_places_building_name",
        "places",
        ["building_name"],
    )


def downgrade():
    op.drop_index("ix_places_building_name", table_name="places")
    op.drop_column("places", "building_name")
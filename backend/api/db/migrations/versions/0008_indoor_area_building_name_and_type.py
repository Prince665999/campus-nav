"""Add building_name and type to indoor_areas.

Revision ID: 0008
Revises: 0007

What this does:
  1. Adds `building_name` (nullable String) to indoor_areas.
     Populated from the `building_name` OSM tag on indoor=room and
     indoor=corridor ways. Nullable so existing rows don't break.
  2. Adds `type` (String, not null, default "room"). Distinguishes
     rooms from corridors on the floor plan.

Nothing is dropped, nothing is renamed. Every existing row is
preserved; the new columns start with building_name NULL and
type="room".
"""

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "indoor_areas",
        sa.Column("building_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "indoor_areas",
        sa.Column(
            "type",
            sa.String(16),
            nullable=False,
            server_default="room",
        ),
    )

    op.create_index(
        "ix_indoor_areas_building_name",
        "indoor_areas",
        ["building_name"],
    )
    op.create_index(
        "ix_indoor_areas_type",
        "indoor_areas",
        ["type"],
    )


def downgrade():
    op.drop_index("ix_indoor_areas_type", table_name="indoor_areas")
    op.drop_index("ix_indoor_areas_building_name", table_name="indoor_areas")
    op.drop_column("indoor_areas", "type")
    op.drop_column("indoor_areas", "building_name")
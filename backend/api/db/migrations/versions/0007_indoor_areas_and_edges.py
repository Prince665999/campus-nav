"""Add indoor_areas and indoor_path_edges tables.

Revision ID: 0007
Revises: 0006

Two new tables, parallel to the outdoor `areas` and `path_edges`
tables. Not read during routing (the indoor engine reads final.osm
directly), but stored for admin visibility and future health checks.
"""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    # --- indoor_areas ---
    op.create_table(
        "indoor_areas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("osm_type", sa.String(16), nullable=False),
        sa.Column("osm_id", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("ref", sa.String(64), nullable=True),
        sa.Column("level", sa.String(16), nullable=True),
        sa.Column("geometry_wkt", sa.Text(), nullable=False),
        sa.Column("door_node_id", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_indoor_areas_name_lower",
        "indoor_areas",
        [sa.text("lower(name)")],
    )
    op.create_index("ix_indoor_areas_level", "indoor_areas", ["level"])
    op.create_index("ix_indoor_areas_osm_id", "indoor_areas", ["osm_id"])
    op.create_index(
        "ix_indoor_areas_door_node_id", "indoor_areas", ["door_node_id"]
    )

    # --- indoor_path_edges ---
    op.create_table(
        "indoor_path_edges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("node_a_osm", sa.String(32), nullable=False),
        sa.Column("node_b_osm", sa.String(32), nullable=False),
        sa.Column("length_m", sa.Float(), nullable=False),
        sa.Column("highway", sa.String(32), nullable=True),
        sa.Column("level", sa.String(32), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False, server_default="walk"),
        sa.Column(
            "corridor", sa.Boolean(), nullable=False, server_default="0"
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_indoor_path_edges_node_a_osm", "indoor_path_edges", ["node_a_osm"]
    )
    op.create_index(
        "ix_indoor_path_edges_node_b_osm", "indoor_path_edges", ["node_b_osm"]
    )
    op.create_index(
        "ix_indoor_path_edges_level", "indoor_path_edges", ["level"]
    )
    op.create_index(
        "ix_indoor_path_edges_kind", "indoor_path_edges", ["kind"]
    )
    op.create_index(
        "ix_indoor_path_edges_pair",
        "indoor_path_edges",
        ["node_a_osm", "node_b_osm"],
        unique=True,
    )


def downgrade():
    op.drop_table("indoor_path_edges")
    op.drop_table("indoor_areas")
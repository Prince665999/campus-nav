"""Add kind, level, room_name to places.

Revision ID: 0006
Revises: 0005

Adds three columns to `places`:
  - kind: "outdoor" (default) or "indoor"
  - level: for indoor places, the floor; null for outdoor
  - room_name: for indoor places, the room this door serves

Existing rows get kind="outdoor" and null for the other two.
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "places",
        sa.Column("kind", sa.String(16), nullable=False, server_default="outdoor"),
    )
    op.add_column("places", sa.Column("level", sa.String(16), nullable=True))
    op.add_column("places", sa.Column("room_name", sa.String(255), nullable=True))
    op.create_index("ix_places_kind", "places", ["kind"])

    # Existing rows already get "outdoor" from the server_default.
    # Nothing else to do.


def downgrade():
    op.drop_index("ix_places_kind", table_name="places")
    op.drop_column("places", "room_name")
    op.drop_column("places", "level")
    op.drop_column("places", "kind")
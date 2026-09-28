"""Add timetable tables and Place.intents.

Revision ID: 0005
Revises: 0004

What this does:
  1. Adds `intents` to `places` (nullable Text).
  2. Creates `programs`.
  3. Creates `program_years`.
  4. Creates `timetable_entries`.

Nothing is dropped, nothing is renamed. Every existing row is
preserved, and the new tables start empty.
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    # --- intents on places ---
    op.add_column("places", sa.Column("intents", sa.Text(), nullable=True))

    # --- programs ---
    op.create_table(
        "programs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("department", sa.String(255), nullable=True),
        sa.Column("code", sa.String(32), nullable=True),
        sa.Column("level", sa.String(32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_programs_name_lower", "programs", [sa.text("lower(name)")])
    op.create_index("ix_programs_code", "programs", ["code"])

    # --- program_years ---
    op.create_table(
        "program_years",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "program_id",
            sa.Integer(),
            sa.ForeignKey("programs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year_number", sa.Integer(), nullable=False),
        sa.Column("academic_year", sa.String(16), nullable=False),
        sa.Column("semester", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("display_name", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_program_years_program_id", "program_years", ["program_id"])
    op.create_index(
        "ix_program_years_unique",
        "program_years",
        ["program_id", "year_number", "academic_year", "semester"],
        unique=True,
    )

    # --- timetable_entries ---
    op.create_table(
        "timetable_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "program_year_id",
            sa.Integer(),
            sa.ForeignKey("program_years.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(5), nullable=False),
        sa.Column("end_time", sa.String(5), nullable=False),
        sa.Column("module_code", sa.String(32), nullable=False),
        sa.Column("module_name", sa.String(255), nullable=True),
        sa.Column("lecturer_name", sa.String(255), nullable=True),
        sa.Column("venue_code", sa.String(64), nullable=True),
        sa.Column("is_cross_cutting", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_timetable_entries_program_year_id",
        "timetable_entries",
        ["program_year_id"],
    )
    op.create_index(
        "ix_timetable_entries_day_of_week",
        "timetable_entries",
        ["day_of_week"],
    )
    op.create_index(
        "ix_timetable_entries_venue_code",
        "timetable_entries",
        ["venue_code"],
    )
    op.create_index(
        "ix_timetable_entries_natural_key",
        "timetable_entries",
        ["program_year_id", "day_of_week", "start_time", "module_code"],
        unique=True,
    )
    op.create_index(
        "ix_timetable_entries_lookup",
        "timetable_entries",
        ["program_year_id", "day_of_week"],
    )


def downgrade():
    op.drop_index("ix_timetable_entries_lookup", table_name="timetable_entries")
    op.drop_index("ix_timetable_entries_natural_key", table_name="timetable_entries")
    op.drop_index("ix_timetable_entries_venue_code", table_name="timetable_entries")
    op.drop_index("ix_timetable_entries_day_of_week", table_name="timetable_entries")
    op.drop_index("ix_timetable_entries_program_year_id", table_name="timetable_entries")
    op.drop_table("timetable_entries")

    op.drop_index("ix_program_years_unique", table_name="program_years")
    op.drop_index("ix_program_years_program_id", table_name="program_years")
    op.drop_table("program_years")

    op.drop_index("ix_programs_code", table_name="programs")
    op.drop_index("ix_programs_name_lower", table_name="programs")
    op.drop_table("programs")

    op.drop_column("places", "intents")
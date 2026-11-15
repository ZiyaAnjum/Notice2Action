"""add_current_stage_and_progress_to_notices

Revision ID: 946af6febf28
Revises:
Create Date: 2026-11-15 02:24:30.058979

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '946af6febf28'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add current_stage and progress columns."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {col["name"] for col in inspector.get_columns("notices")}

    with op.batch_alter_table("notices") as batch_op:
        if "current_stage" not in existing_cols:
            batch_op.add_column(
                sa.Column("current_stage", sa.String(length=64), nullable=True, server_default="uploaded")
            )
        if "progress" not in existing_cols:
            batch_op.add_column(
                sa.Column("progress", sa.Integer(), nullable=False, server_default="0")
            )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("notices") as batch_op:
        batch_op.drop_column("progress")
        batch_op.drop_column("current_stage")

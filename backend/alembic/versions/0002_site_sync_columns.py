"""Adds external_id, photo_url and live_place to mechanics (only if they are missing)."""
revision = "0002"
down_revision = "0001"
from alembic import op
from app.db import ensure_columns


def upgrade():
    ensure_columns(op.get_bind())


def downgrade():
    pass

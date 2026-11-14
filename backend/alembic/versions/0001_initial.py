"""Initial tables: users, zones, mechanics, WhatsApp groups, change history, quiz results."""
revision = "0001"
down_revision = None
from alembic import op
from app.db import Base
from app import models  # noqa: F401


def upgrade():
    Base.metadata.create_all(bind=op.get_bind())


def downgrade():
    Base.metadata.drop_all(bind=op.get_bind())

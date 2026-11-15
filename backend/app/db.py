"""Database connection. Works with Neon (PostgreSQL) and with a local SQLite file."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase


def _url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or "sqlite:///./instant_mechanic.db"
    # Neon gives "postgresql://..." or "postgres://..."; tell SQLAlchemy to use the psycopg 3 driver.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _url()
_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first version. Existing databases get them here, without losing any data.
NEW_COLUMNS = {"mechanics": {"external_id": "VARCHAR(40) DEFAULT ''", "photo_url": "VARCHAR(500) DEFAULT ''",
                             "live_place": "VARCHAR(300) DEFAULT ''"},
               "users": {"name": "VARCHAR(120) DEFAULT ''"}}


def ensure_columns(bind=None):
    from sqlalchemy import inspect, text
    bind = bind or engine
    insp = inspect(bind)
    for table, cols in NEW_COLUMNS.items():
        if not insp.has_table(table):
            continue
        have = {c["name"] for c in insp.get_columns(table)}
        for name, ddl in cols.items():
            if name not in have:
                stmt = text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
                if hasattr(bind, "begin") and not hasattr(bind, "in_transaction"):
                    with bind.begin() as conn:
                        conn.execute(stmt)
                else:
                    bind.execute(stmt)

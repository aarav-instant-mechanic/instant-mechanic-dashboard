import os
from pathlib import Path

# Read backend/.env or the project-level .env if present (no extra package needed).
for _env in (Path(__file__).resolve().parents[1] / ".env", Path(__file__).resolve().parents[2] / ".env"):
    if _env.exists():
        for _line in _env.read_text(encoding="utf-8").splitlines():
            if "=" in _line and not _line.strip().startswith("#"):
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

from contextlib import asynccontextmanager  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from .db import Base, SessionLocal, engine, ensure_columns  # noqa: E402
from . import models  # noqa: E402,F401
from .routers import core, gps, manage, sync, training  # noqa: E402
from .seed import seed_logins, seed_zones  # noqa: E402



@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(engine)   # safe to run every time; creates only what is missing
    ensure_columns()
    with SessionLocal() as db:
        seed_zones(db)
        seed_logins(db)
    yield


app = FastAPI(title="Instant Mechanic Training Dashboard API", lifespan=lifespan)

origins = [o.strip().rstrip("/") for o in os.getenv("FRONTEND_URL", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

for r in (core.router, manage.router, training.router, gps.router, sync.router):
    app.include_router(r)


@app.get("/health")
def health():
    return {"status": "ok"}

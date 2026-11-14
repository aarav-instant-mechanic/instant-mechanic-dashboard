"""Live location. A mechanic's phone sends its position here, identified by his private tracking ID.

Two ways in:
  1. The free Traccar Client app. Server URL: https://YOUR-BACKEND/gps   Device identifier: the tracking ID.
     Older versions send values in the address (?id=..&lat=..&lon=..); newer versions send JSON. Both are accepted.
  2. The "Share my location" page, which posts to /share/{tracking ID}.
Positions are saved only if the Admin has switched sharing on for that mechanic.
"""
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from ..common import log, mechanic_json
from ..db import get_db
from ..models import Mechanic, User
from ..security import admin_user

router = APIRouter()


def _save(db: Session, token: str, lat, lng) -> bool:
    m = db.query(Mechanic).filter(Mechanic.track_token == str(token)).first() if token else None
    if not m or not m.active or not m.share_enabled:
        return False
    lat, lng = float(lat), float(lng)
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    m.live_lat, m.live_lng, m.live_at = lat, lng, datetime.now(timezone.utc)
    db.commit()
    return True


@router.api_route("/gps", methods=["GET", "POST"])
async def traccar(request: Request, db: Session = Depends(get_db)):
    q = request.query_params
    token, lat, lng = q.get("id") or q.get("deviceid"), q.get("lat"), q.get("lon")
    if lat is None and request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}
        if isinstance(body, dict):
            token = token or body.get("device_id") or body.get("id")
            loc = body.get("location") if isinstance(body.get("location"), dict) else body
            coords = loc.get("coords") if isinstance(loc.get("coords"), dict) else loc
            lat = coords.get("latitude", coords.get("lat"))
            lng = coords.get("longitude", coords.get("lon"))
    try:
        ok = lat is not None and lng is not None and _save(db, token, lat, lng)
    except (TypeError, ValueError):
        ok = False
    # Always answer 200 so the app does not keep retrying; unknown or switched-off IDs are simply ignored.
    return {"ok": bool(ok)}


@router.get("/share/{token}")
def share_info(token: str, db: Session = Depends(get_db)):
    m = db.query(Mechanic).filter(Mechanic.track_token == token).first()
    if not m or not m.active:
        raise HTTPException(404, "This link is not valid. Ask the office for a new one.")
    return {"name": m.name, "share_enabled": m.share_enabled}


@router.post("/share/{token}")
def share_position(token: str, data: dict = Body(...), db: Session = Depends(get_db)):
    try:
        ok = _save(db, token, data.get("lat"), data.get("lng"))
    except (TypeError, ValueError):
        ok = False
    if not ok:
        raise HTTPException(400, "Location sharing is switched off for you. Ask the office to switch it on.")
    return {"ok": True}


@router.post("/mechanics/{mid}/sharing")
def set_sharing(mid: int, data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Admin switches sharing on (only after the mechanic agrees) or off, or issues a new tracking ID."""
    m = db.get(Mechanic, mid)
    if not m:
        raise HTTPException(404, "Mechanic not found.")
    if data.get("new_token") or not m.track_token:
        m.track_token = secrets.token_urlsafe(12)
    if "enabled" in data:
        m.share_enabled = bool(data["enabled"])
        if not m.share_enabled:
            m.live_lat = m.live_lng = m.live_at = None
        log(db, admin.email, "sharing_on" if m.share_enabled else "sharing_off", "mechanic", f"{m.code} {m.name}",
            "Mechanic agreed to share location" if m.share_enabled else "")
    db.commit()
    return mechanic_json(m, True)

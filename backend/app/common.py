"""Shared helpers: turning database rows into JSON, and writing the change history."""
import json
import math
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import AuditLog, Mechanic, Zone
from .geo import parse_polygon

LIVE_MINUTES = 10


def log(db: Session, user: str, action: str, entity: str, label: str, detail="") -> None:
    if not isinstance(detail, str):
        detail = json.dumps(detail, ensure_ascii=False)
    db.add(AuditLog(user=user, action=action, entity=entity, entity_label=label, detail=detail))


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def iso(dt):
    return _aware(dt).isoformat() if dt else None


def position(m: Mechanic) -> dict:
    """Where to draw the mechanic, and how sure we are.
    live = phone sent a position in the last few minutes; exact = set by Admin; approximate = zone centre."""
    live_at = _aware(m.live_at)
    live = None
    if m.share_enabled and live_at and m.live_lat is not None:
        age_min = (datetime.now(timezone.utc) - live_at).total_seconds() / 60
        live = {"lat": m.live_lat, "lng": m.live_lng, "at": live_at.isoformat(), "fresh": age_min <= LIVE_MINUTES}
    if live and live["fresh"]:
        return {"kind": "live", "lat": live["lat"], "lng": live["lng"], "live": live}
    if m.lat is not None and m.lng is not None:
        return {"kind": "exact", "lat": m.lat, "lng": m.lng, "live": live}
    if live:
        return {"kind": "last_seen", "lat": live["lat"], "lng": live["lng"], "live": live}
    if m.zone and m.zone.lat is not None:
        # spread markers around the zone centre so they do not sit on top of each other
        angle = (m.id * 137.5) % 360
        dist = 0.004 + (m.id % 5) * 0.0018
        return {"kind": "approximate", "lat": m.zone.lat + dist * math.sin(math.radians(angle)),
                "lng": m.zone.lng + dist * math.cos(math.radians(angle)), "live": None}
    return {"kind": "none", "lat": None, "lng": None, "live": None}


def mechanic_json(m: Mechanic, admin: bool = False) -> dict:
    z = m.zone
    d = {
        "id": m.id, "code": m.code, "name": m.name, "under_tx": m.under_tx, "gmaps_name": m.gmaps_name,
        "gmaps_link": m.gmaps_link, "phone": m.phone, "alt_phone": m.alt_phone,
        "zone": z.code if z else "", "zone_name": z.name if z else "", "city": z.city if z else "",
        "region": z.region if z else "", "locality": m.locality, "coverage_areas": m.coverage_areas,
        "radius_km": m.radius_km, "working_hours": m.working_hours, "weekly_off": m.weekly_off,
        "service_type": m.service_type, "garage_name": m.garage_name, "notes": m.notes,
        "groups": [{"id": g.id, "name": g.name, "link": g.link} for g in m.groups],
        "active": m.active, "position": position(m), "share_enabled": m.share_enabled,
        "photo_url": m.photo_url, "live_place": m.live_place if m.share_enabled else "", "site_id": m.external_id,
        "updated_at": _aware(m.updated_at).isoformat() if m.updated_at else None,
    }
    if admin:
        d.update({"review_flags": [f for f in m.review_flags.split(",") if f], "source_row": m.source_row,
                  "track_token": m.track_token, "updated_by": m.updated_by, "exact_lat": m.lat, "exact_lng": m.lng})
    return d


def zone_json(z: Zone, count: int | None = None) -> dict:
    d = {"id": z.id, "code": z.code, "name": z.name, "city": z.city, "region": z.region,
         "localities": z.localities, "lat": z.lat, "lng": z.lng, "polygon": parse_polygon(z.polygon),
         "notes": z.notes, "active": z.active}
    if count is not None:
        d["mechanics"] = count
    return d

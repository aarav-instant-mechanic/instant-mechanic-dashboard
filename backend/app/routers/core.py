"""Sign-in, zones, mechanics and WhatsApp groups."""
import json
import secrets
import time
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from ..common import log, mechanic_json, zone_json
from ..db import get_db
from ..geo import coords_from_maps_link
from ..models import Mechanic, User, WhatsAppGroup, Zone
from ..security import admin_user, check_password, current_user, hash_password, make_token
from ..seed import city_region, normalize_zone_code
from ..sync import refresh_live

router = APIRouter()

EDITABLE = ["name", "under_tx", "gmaps_name", "gmaps_link", "phone", "alt_phone", "locality", "coverage_areas",
            "working_hours", "weekly_off", "service_type", "garage_name", "notes"]


# ---------- sign-in ----------
_failed: dict[str, list[float]] = {}   # wrong-password attempts per address, kept in memory


@router.post("/auth/login")
def login(request: Request, data: dict = Body(...), db: Session = Depends(get_db)):
    email = str(data.get("email", "")).strip().lower()
    who = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0]
    recent = [t for t in _failed.get(who, []) if time.time() - t < 300]
    if len(recent) >= 8:
        raise HTTPException(429, "Too many wrong attempts. Wait 5 minutes and try again.")
    user = db.query(User).filter(User.email == email).first()
    if not user or not check_password(str(data.get("password", "")), user.password_hash):
        _failed[who] = recent + [time.time()]
        raise HTTPException(401, "Wrong email or password.")
    _failed.pop(who, None)
    return {"token": make_token(user), "role": user.role, "email": user.email}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"email": user.email, "role": user.role}


@router.post("/auth/password")
def change_password(data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Admin changes the password of the Admin or the shared Agent login."""
    role, new = data.get("role"), str(data.get("password", ""))
    if role not in ("admin", "agent") or len(new) < 8:
        raise HTTPException(400, "Choose the login and a password of at least 8 characters.")
    target = db.query(User).filter(User.role == role).first()
    if not target:
        raise HTTPException(404, f"There is no {role} login yet.")
    target.password_hash = hash_password(new)
    log(db, admin.email, "password_changed", "login", role)
    db.commit()
    return {"ok": True}


# ---------- zones ----------
@router.get("/zones")
def zones(db: Session = Depends(get_db), user: User = Depends(current_user)):
    counts = dict(db.query(Mechanic.zone_id, func.count()).filter(Mechanic.active.is_(True)).group_by(Mechanic.zone_id))
    rows = db.query(Zone).filter(Zone.active.is_(True)).all()
    rows.sort(key=lambda z: (z.city, z.code.split("-")[0], int(z.code.split("-")[1])))
    return [zone_json(z, counts.get(z.id, 0)) for z in rows]


@router.post("/zones")
def create_zone(data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    code = normalize_zone_code(str(data.get("code", "")))
    if not code:
        raise HTTPException(400, "Zone code must look like G-9 or SD-10.")
    if db.query(Zone).filter(Zone.code == code).first():
        raise HTTPException(400, f"Zone {code} already exists.")
    city, region = city_region(code)
    z = Zone(code=code, city=city, region=region)
    db.add(z)
    _apply_zone(z, data)
    log(db, admin.email, "created", "zone", code)
    db.commit()
    return zone_json(z, 0)


def _apply_zone(z: Zone, data: dict):
    for f in ("name", "localities", "notes"):
        if f in data:
            setattr(z, f, str(data[f] or "").strip())
    for f in ("lat", "lng"):
        if f in data:
            setattr(z, f, float(data[f]) if data[f] not in ("", None) else None)
    if "polygon" in data:
        pts = data["polygon"] or []
        z.polygon = json.dumps([[float(p[0]), float(p[1])] for p in pts]) if len(pts) >= 3 else ""
    if "active" in data:
        z.active = bool(data["active"])


@router.put("/zones/{zone_id}")
def update_zone(zone_id: int, data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    z = db.get(Zone, zone_id)
    if not z:
        raise HTTPException(404, "Zone not found.")
    if data.get("active") is False and db.query(Mechanic).filter(Mechanic.zone_id == z.id, Mechanic.active.is_(True)).count():
        raise HTTPException(400, "Move this zone's mechanics to another zone before disabling it.")
    _apply_zone(z, data)
    log(db, admin.email, "updated", "zone", z.code, {k: ("shape" if k == "polygon" else v) for k, v in data.items()})
    db.commit()
    return zone_json(z)


# ---------- mechanics ----------
def _query(db, city="", zone="", q="", service="", hours="", missing="", active=True):
    qry = db.query(Mechanic).outerjoin(Zone, Mechanic.zone_id == Zone.id).filter(Mechanic.active.is_(active))
    if city:
        qry = qry.filter(or_(Zone.city == city, Zone.region == city))
    if zone:
        qry = qry.filter(Zone.code == (normalize_zone_code(zone) or zone))
    if service:
        qry = qry.filter(Mechanic.service_type == service)
    if hours == "24/7":
        qry = qry.filter(Mechanic.working_hours == "24/7")
    elif hours == "timed":
        qry = qry.filter(Mechanic.working_hours != "24/7", Mechanic.working_hours != "")
    if missing == "phone":
        qry = qry.filter(Mechanic.phone == "")
    elif missing == "gmaps_name":
        qry = qry.filter(Mechanic.gmaps_name == "")
    elif missing == "location":
        qry = qry.filter(Mechanic.lat.is_(None))
    elif missing == "group":
        qry = qry.filter(~Mechanic.groups.any())
    if q:
        like = f"%{q.strip().lower()}%"
        zone_guess = normalize_zone_code(q)
        conds = [func.lower(c).like(like) for c in (Mechanic.name, Mechanic.gmaps_name, Mechanic.under_tx, Mechanic.phone,
                                                     Mechanic.alt_phone, Mechanic.locality, Mechanic.coverage_areas,
                                                     Mechanic.code, Zone.code, Zone.name, Zone.city, Zone.region)]
        conds.append(Mechanic.groups.any(func.lower(WhatsAppGroup.name).like(like)))
        if zone_guess:
            conds.append(Zone.code == zone_guess)
        qry = qry.filter(or_(*conds))
    return qry


@router.get("/mechanics")
def mechanics(city: str = "", zone: str = "", q: str = "", service: str = "", hours: str = "", missing: str = "",
              active: bool = True, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not active and user.role != "admin":
        raise HTTPException(403, "Only the Admin login can see deactivated mechanics.")
    refresh_live(db)   # pulls the latest shared positions from the company site, at most every 90 seconds
    rows = _query(db, city, zone, q, service, hours, missing, active).order_by(Zone.city, Zone.code, Mechanic.name).all()
    return [mechanic_json(m, user.role == "admin") for m in rows]


@router.get("/mechanics/{mid}")
def mechanic(mid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    m = db.get(Mechanic, mid)
    if not m or (not m.active and user.role != "admin"):
        raise HTTPException(404, "Mechanic not found.")
    return mechanic_json(m, user.role == "admin")


def _apply_mechanic(db: Session, m: Mechanic, data: dict) -> dict:
    """Applies the form values and returns {field: [old, new]} for the change history."""
    changes = {}

    def put(field, new):
        old = getattr(m, field)
        if old != new:
            changes[field] = [old, new]
            setattr(m, field, new)

    for f in EDITABLE:
        if f in data:
            put(f, str(data[f] or "").strip())
    if "radius_km" in data and data["radius_km"] not in ("", None):
        r = float(data["radius_km"])
        if not 0.5 <= r <= 50:
            raise HTTPException(400, "Radius must be between 0.5 and 50 km.")
        put("radius_km", r)
    if "zone" in data:
        z = db.query(Zone).filter(Zone.code == normalize_zone_code(str(data["zone"]))).first()
        if not z:
            raise HTTPException(400, "Choose a zone from the list.")
        if m.zone_id != z.id:
            changes["zone"] = [m.zone.code if m.zone else "", z.code]
            m.zone = z
    if "exact_lat" in data or "exact_lng" in data:
        lat, lng = data.get("exact_lat"), data.get("exact_lng")
        if lat in ("", None) or lng in ("", None):
            put("lat", None)
            put("lng", None)
        else:
            lat, lng = float(lat), float(lng)
            if not (27.5 <= lat <= 29.5 and 76.0 <= lng <= 78.5):
                raise HTTPException(400, "That location is outside Delhi NCR. Check the link or the pin.")
            put("lat", lat)
            put("lng", lng)
    if "group_ids" in data:
        new = db.query(WhatsAppGroup).filter(WhatsAppGroup.id.in_([int(i) for i in data["group_ids"] or []])).all()
        old_names, new_names = sorted(g.name for g in m.groups), sorted(g.name for g in new)
        if old_names != new_names:
            changes["whatsapp_groups"] = [old_names, new_names]
            m.groups = new
    if "review_flags" in data:
        put("review_flags", ",".join(data["review_flags"] or []))
    return changes


def _duplicates(db, m: Mechanic, data: dict) -> list[str]:
    warn = []
    others = db.query(Mechanic).filter(Mechanic.active.is_(True), Mechanic.id != (m.id or 0))
    phone = str(data.get("phone") or "").strip()
    gm = str(data.get("gmaps_name") or "").strip().lower()
    if phone and others.filter(Mechanic.phone == phone).first():
        warn.append("Another mechanic already has this phone number.")
    if gm and others.filter(func.lower(Mechanic.gmaps_name) == gm).first():
        warn.append("Another mechanic already has this Google Maps name.")
    return warn


@router.post("/mechanics")
def create_mechanic(data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    if not str(data.get("name", "")).strip() or not data.get("zone"):
        raise HTTPException(400, "Real name and zone are required.")
    warnings = _duplicates(db, Mechanic(), data)
    if warnings and not data.get("confirm_duplicates"):
        return {"saved": False, "warnings": warnings}
    m = Mechanic(name="", track_token=secrets.token_urlsafe(12), updated_by=admin.email)
    db.add(m)
    _apply_mechanic(db, m, data)
    db.flush()
    m.code = f"IM-{m.id:04d}"
    log(db, admin.email, "created", "mechanic", f"{m.code} {m.name}")
    db.commit()
    return {"saved": True, "mechanic": mechanic_json(m, True)}


@router.put("/mechanics/{mid}")
def update_mechanic(mid: int, data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    m = db.get(Mechanic, mid)
    if not m:
        raise HTTPException(404, "Mechanic not found.")
    if "name" in data and not str(data["name"]).strip():
        raise HTTPException(400, "Real name cannot be empty.")
    warnings = _duplicates(db, m, data)
    if warnings and not data.get("confirm_duplicates"):
        return {"saved": False, "warnings": warnings}
    changes = _apply_mechanic(db, m, data)
    if changes:
        m.updated_by = admin.email
        log(db, admin.email, "updated", "mechanic", f"{m.code} {m.name}", changes)
    db.commit()
    return {"saved": True, "mechanic": mechanic_json(m, True)}


@router.post("/mechanics/{mid}/active")
def set_active(mid: int, data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Deactivate (remove from the map and lists, record is kept) or restore a mechanic."""
    m = db.get(Mechanic, mid)
    if not m:
        raise HTTPException(404, "Mechanic not found.")
    m.active = bool(data.get("active"))
    if not m.active:
        m.share_enabled = False
    log(db, admin.email, "restored" if m.active else "deactivated", "mechanic", f"{m.code} {m.name}",
        str(data.get("reason", "")))
    db.commit()
    return mechanic_json(m, True)


@router.post("/maps-link")
def read_maps_link(data: dict = Body(...), admin: User = Depends(admin_user)):
    found = coords_from_maps_link(str(data.get("link", "")))
    if not found:
        raise HTTPException(400, "Could not read a location from that link. Open the place in Google Maps, copy the "
                                 "full link from the address bar, or drag the pin on the map instead.")
    return {"lat": found[0], "lng": found[1]}


# ---------- WhatsApp groups ----------
def group_json(g: WhatsAppGroup, full=False, admin=False):
    members = [m for m in g.mechanics if m.active]
    d = {"id": g.id, "name": g.name, "link": g.link, "city": g.city, "notes": g.notes, "members": len(members),
         "zones": sorted({m.zone.code for m in members if m.zone})}
    if full:
        d["mechanics"] = [mechanic_json(m, admin) for m in sorted(members, key=lambda m: m.name)]
    return d


@router.get("/groups")
def groups(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [group_json(g) for g in db.query(WhatsAppGroup).order_by(WhatsAppGroup.name)]


@router.get("/groups/{gid}")
def group(gid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    g = db.get(WhatsAppGroup, gid)
    if not g:
        raise HTTPException(404, "Group not found.")
    return group_json(g, True, user.role == "admin")


@router.post("/groups")
def save_group(data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    name = str(data.get("name", "")).strip()
    if not name:
        raise HTTPException(400, "Group name is required.")
    g = db.get(WhatsAppGroup, int(data["id"])) if data.get("id") else None
    clash = db.query(WhatsAppGroup).filter(func.lower(WhatsAppGroup.name) == name.lower()).first()
    if clash and (g is None or clash.id != g.id):
        raise HTTPException(400, "A group with this name already exists.")
    link = str(data.get("link", "")).strip()
    if link and not link.startswith("https://chat.whatsapp.com/"):
        raise HTTPException(400, "A WhatsApp group link starts with https://chat.whatsapp.com/")
    if g is None:
        g = WhatsAppGroup(name=name)
        db.add(g)
        action = "created"
    else:
        action = "updated"
    g.name, g.link = name, link
    g.city, g.notes = str(data.get("city", "")).strip(), str(data.get("notes", "")).strip()
    log(db, admin.email, action, "whatsapp_group", name)
    db.commit()
    return group_json(g)


@router.delete("/groups/{gid}")
def delete_group(gid: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    g = db.get(WhatsAppGroup, gid)
    if not g:
        raise HTTPException(404, "Group not found.")
    log(db, admin.email, "deleted", "whatsapp_group", g.name, f"{len(g.mechanics)} mechanics were linked")
    db.delete(g)
    db.commit()
    return {"ok": True}

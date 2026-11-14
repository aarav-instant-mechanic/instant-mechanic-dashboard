"""Overview numbers, data-quality lists, CSV import and export, change history."""
import csv
import io
from collections import Counter, defaultdict
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session
from ..common import iso, log, mechanic_json, position
from ..db import get_db
from ..importer import run_import
from ..models import AuditLog, Mechanic, User, WhatsAppGroup, Zone
from ..security import admin_user, current_user
from ..seed import CITIES

router = APIRouter()


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Every number here is counted from the database at the moment of the request."""
    mechs = db.query(Mechanic).filter(Mechanic.active.is_(True)).all()
    zones = db.query(Zone).filter(Zone.active.is_(True)).all()
    per_zone = Counter(m.zone_id for m in mechs)
    kinds = Counter(position(m)["kind"] for m in mechs)
    by_city = []
    for city in CITIES:
        zs = [z for z in zones if z.city == city]
        ms = [m for m in mechs if m.zone and m.zone.city == city]
        regions = Counter(m.zone.region for m in ms) if city == "Delhi" else {}
        by_city.append({"city": city, "mechanics": len(ms), "zones": len(zs),
                        "covered_zones": sum(1 for z in zs if per_zone[z.id]),
                        "empty_zones": [z.code for z in zs if not per_zone[z.id]],
                        "regions": dict(sorted(regions.items()))})
    return {
        "mechanics": len(mechs),
        "deactivated": db.query(Mechanic).filter(Mechanic.active.is_(False)).count(),
        "zones": len(zones), "covered_zones": sum(1 for z in zones if per_zone[z.id]),
        "empty_zones": [{"code": z.code, "name": z.name, "city": z.city} for z in zones if not per_zone[z.id]],
        "low_zones": [{"code": z.code, "name": z.name, "city": z.city, "mechanics": per_zone[z.id]}
                      for z in zones if per_zone[z.id] == 1],
        "groups": db.query(WhatsAppGroup).count(),
        "by_city": by_city,
        "by_zone": sorted([{"code": z.code, "name": z.name, "city": z.city, "mechanics": per_zone[z.id]} for z in zones],
                          key=lambda r: -r["mechanics"]),
        "by_service": dict(Counter(m.service_type or "Not added yet" for m in mechs).most_common()),
        "by_hours": {"24/7": sum(1 for m in mechs if m.working_hours == "24/7"),
                     "Fixed hours": sum(1 for m in mechs if m.working_hours not in ("", "24/7")),
                     "Not added yet": sum(1 for m in mechs if not m.working_hours)},
        "location": {"live": kinds["live"], "exact": kinds["exact"], "last_seen": kinds["last_seen"],
                     "approximate": kinds["approximate"], "none": kinds["none"]},
        "missing": {"phone": sum(1 for m in mechs if not m.phone),
                    "gmaps_name": sum(1 for m in mechs if not m.gmaps_name),
                    "group": sum(1 for m in mechs if not m.groups),
                    "location": sum(1 for m in mechs if m.lat is None)},
    }


@router.get("/review")
def review(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Rows the Admin should look at: flagged at import, and possible duplicates."""
    mechs = db.query(Mechanic).filter(Mechanic.active.is_(True)).all()
    flagged = [mechanic_json(m, True) for m in mechs if m.review_flags]
    buckets = defaultdict(list)
    for m in mechs:
        buckets[("name", m.name.strip().lower())].append(m)
        if m.phone:
            buckets[("phone", m.phone)].append(m)
        if m.gmaps_name:
            buckets[("maps name", m.gmaps_name.strip().lower())].append(m)
    seen, dups = set(), []
    for (why, _), group in buckets.items():
        ids = tuple(sorted(m.id for m in group))
        if len(group) > 1 and ids not in seen:
            seen.add(ids)
            dups.append({"same": why, "mechanics": [mechanic_json(m, True) for m in group]})
    return {"flagged": flagged, "duplicates": dups}


@router.post("/import")
async def import_csv(file: UploadFile = File(...), commit: bool = False,
                     admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    content = await file.read()
    if len(content) > 2_000_000:
        raise HTTPException(400, "The file is larger than 2 MB. Upload a CSV of mechanics only.")
    try:
        result = run_import(db, content, commit=commit, user=admin.email)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if commit:
        log(db, admin.email, "imported", "csv", file.filename or "upload", result["counts"])
        db.commit()
    result["committed"] = commit
    return result


EXPORT_COLUMNS = ["ID", "S.NO", "ZONE", "Location", "Name", "Under TX", "Gmaps Name", "Gmaps Link", "Working Hours",
                  "Weekly Off", "Service Type", "Phone", "Alt Phone", "WhatsApp Group", "Coverage Areas", "Radius Km",
                  "Latitude", "Longitude", "Garage Name", "Notes"]


@router.get("/export")
def export_csv(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Admin only. The same file can be edited in Excel and uploaded again to update many mechanics."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(EXPORT_COLUMNS)
    for m in db.query(Mechanic).filter(Mechanic.active.is_(True)).order_by(Mechanic.id):
        w.writerow([m.code, m.source_row, m.zone.code if m.zone else "", m.locality, m.name, m.under_tx, m.gmaps_name,
                    m.gmaps_link, m.working_hours, m.weekly_off, m.service_type, m.phone, m.alt_phone,
                    m.groups[0].name if m.groups else "", m.coverage_areas, m.radius_km,
                    m.lat if m.lat is not None else "", m.lng if m.lng is not None else "", m.garage_name, m.notes])
    log(db, admin.email, "exported", "csv", "mechanics.csv")
    db.commit()
    return Response("﻿" + buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="mechanics.csv"'})


@router.get("/audit")
def audit(limit: int = 200, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 1000)).all()
    return [{"id": r.id, "at": iso(r.at), "user": r.user, "action": r.action, "entity": r.entity,
             "label": r.entity_label, "detail": r.detail} for r in rows]

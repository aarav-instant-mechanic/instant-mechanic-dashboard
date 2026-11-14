"""Reads the mechanic list from the company site (instantmechanic.online) and brings it into the dashboard.

The site gives, for each mechanic: id, name, mobile, zone code, city, deleted flag, Google name, photo and,
if he shares his Google location, his last shared position and when it was updated.

Rules
- Deleted and test records are skipped. Records without a Delhi NCR zone code are skipped and listed.
- A site record is linked to an existing dashboard mechanic by: site ID, then phone, then Google Maps name
  (same zone), then name (same zone). Otherwise it is added as a new mechanic.
- For a linked mechanic the site only fills blank fields. It never overwrites what the Admin typed.
  Photo and shared position always follow the site.
- The site's shared position is the phone's last position, not a fixed address. It is shown as Live or Last seen.
"""
import json
import os
import re
import secrets
import time
import urllib.request
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import Mechanic, Zone
from .seed import city_region, normalize_zone_code

DEFAULT_URL = "https://ai.instantmechanic.online/bot/api/mechanic-location-list"
TEST_NAME = re.compile(r"\b(test|testing|bot)\b|^mechanic phone$", re.I)


def source_url() -> str:
    return os.getenv("MECHANIC_SOURCE_URL", DEFAULT_URL).strip()


def fetch_rows(timeout: int = 20) -> list[dict]:
    url = source_url()
    if not url:
        raise ValueError("MECHANIC_SOURCE_URL is empty, so there is nothing to sync from.")
    headers = {"User-Agent": "instant-mechanic-dashboard", "Accept": "application/json"}
    token = os.getenv("MECHANIC_SOURCE_TOKEN", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise ValueError(f"Could not read the mechanic list from the site ({type(e).__name__}). Try again in a minute.")
    rows = data.get("rows") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise ValueError("The site answered, but not with a mechanic list.")
    return rows


def _when(text):
    try:
        dt = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _latest_position(rows: list[dict]):
    """A mechanic can have several shared locations. Use the one updated most recently."""
    best = None
    for r in rows:
        if r.get("lat") is None or r.get("lng") is None:
            continue
        at = _when(r.get("last_updated"))
        if at and (best is None or at > best["at"]):
            best = {"lat": float(r["lat"]), "lng": float(r["lng"]), "at": at,
                    "place": str(r.get("location_name") or "").strip()[:300], "photo": str(r.get("photo_url") or "")[:500],
                    "google_name": str(r.get("google_name") or "").strip()}
    return best


def group_by_id(rows: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in rows:
        if isinstance(r, dict) and r.get("id") is not None:
            out.setdefault(str(r["id"]), []).append(r)
    return out


def run_sync(db: Session, rows: list[dict], commit: bool, user: str = "") -> dict:
    zones = {z.code: z for z in db.query(Zone)}
    mechs = db.query(Mechanic).all()
    by_ext = {m.external_id: m for m in mechs if m.external_id}
    res = {"site_records": 0, "new": [], "linked": [], "updates": [], "deactivate": [], "unchanged": 0,
           "skipped": {"deleted on the site": 0, "test record": 0, "outside Delhi NCR or no zone code": []},
           "new_zones": [], "with_shared_location": 0}
    groups = group_by_id(rows)
    res["site_records"] = len(groups)

    for ext, items in groups.items():
        r = items[0]
        name = str(r.get("name") or "").strip()
        phone = re.sub(r"\D", "", str(r.get("mobile") or ""))[-10:]
        linked = by_ext.get(ext)
        if r.get("is_deleted"):
            if linked and linked.active:
                res["deactivate"].append({"name": linked.name, "code": linked.code})
                if commit:
                    linked.active, linked.share_enabled, linked.updated_by = False, False, user
            else:
                res["skipped"]["deleted on the site"] += 1
            continue
        if not name or TEST_NAME.search(name) or str(r.get("city") or "").strip().lower() == "testing":
            res["skipped"]["test record"] += 1
            continue
        code = normalize_zone_code(str(r.get("location") or ""))
        if not code:
            res["skipped"]["outside Delhi NCR or no zone code"].append(
                {"site_id": ext, "name": name, "location": str(r.get("location") or ""), "city": str(r.get("city") or "")})
            continue
        if code not in zones:
            city, region = city_region(code)
            z = Zone(code=code, city=city, region=region, notes="Created by site sync; set its name and centre.")
            zones[code] = z
            res["new_zones"].append(code)
            if commit:
                db.add(z)
                db.flush()
        zone = zones[code]
        pos = _latest_position(items)
        gname = (pos or {}).get("google_name") or next((str(i.get("google_name")).strip() for i in items if i.get("google_name")), "")
        photo = (pos or {}).get("photo") or next((str(i.get("photo_url")) for i in items if i.get("photo_url")), "")
        if pos:
            res["with_shared_location"] += 1

        how = "site ID" if linked else ""
        if not linked:
            free = [m for m in mechs if not m.external_id and m.active]
            linked = (phone and next((m for m in free if re.sub(r"\D", "", m.phone)[-10:] == phone), None)) or None
            how = "phone" if linked else ""
            if not linked and gname:
                linked = next((m for m in free if m.zone_id == zone.id and m.gmaps_name.strip().lower() == gname.lower()), None)
                how = "Google Maps name" if linked else ""
            if not linked:
                linked = next((m for m in free if m.zone_id == zone.id and m.name.strip().lower() == name.lower()), None)
                how = "name" if linked else ""

        if linked is None:
            res["new"].append({"site_id": ext, "name": name, "zone": code, "phone": bool(phone), "gmaps_name": gname})
            if commit:
                m = Mechanic(name=name, phone=phone, zone=zone, gmaps_name=gname, photo_url=photo, external_id=ext,
                             track_token=secrets.token_urlsafe(12), updated_by=user)
                _set_live(m, pos, enable=True)
                db.add(m)
                db.flush()
                m.code = f"IM-{m.id:04d}"
                mechs.append(m)
                by_ext[ext] = m
            continue

        changes = {}
        if not linked.external_id:
            res["linked"].append({"site_id": ext, "site_name": name, "dashboard_name": linked.name, "zone": code, "matched_by": how})
            linked_now = True
        else:
            linked_now = False
        for field, value in (("phone", phone), ("gmaps_name", gname)):
            if value and not getattr(linked, field):
                changes[field] = ["", value]
        if photo and linked.photo_url != photo:
            changes["photo"] = ["", "updated"]
        if linked.zone_id != zone.id and linked.zone_id is not None and zone.id is not None:
            changes["zone on the site is different"] = [linked.zone.code, code]   # reported only, not changed
        real = {k: v for k, v in changes.items() if k != "zone on the site is different"}
        if not real and not linked_now:
            res["unchanged"] += 1
        elif changes and not linked_now:
            res["updates"].append({"name": linked.name, "code": linked.code, "changes": changes})
        if commit:
            linked.external_id = ext
            by_ext[ext] = linked
            for field in ("phone", "gmaps_name"):
                if field in changes:
                    setattr(linked, field, changes[field][1])
            if photo:
                linked.photo_url = photo
            _set_live(linked, pos, enable=linked_now)
            if real or linked_now:
                linked.updated_by = user
    if commit:
        db.commit()
    res["counts"] = {"new": len(res["new"]), "linked": len(res["linked"]), "updates": len(res["updates"]),
                     "deactivate": len(res["deactivate"]), "unchanged": res["unchanged"],
                     "skipped_no_zone": len(res["skipped"]["outside Delhi NCR or no zone code"])}
    return res


def _set_live(m: Mechanic, pos, enable: bool = False):
    if enable and pos:
        m.share_enabled = True       # he already shares his Google location with the company
    if pos and m.share_enabled:
        m.live_lat, m.live_lng, m.live_at, m.live_place = pos["lat"], pos["lng"], pos["at"], pos["place"]


_last_try = 0.0


def refresh_live(db: Session, min_gap: int = 90) -> None:
    """Called when the mechanic list is opened: pulls the latest shared positions from the site, at most
    once every 90 seconds. Any problem is ignored so the dashboard keeps working if the site is down."""
    global _last_try
    if os.getenv("LIVE_SYNC", "on").lower() == "off" or not source_url() or time.time() - _last_try < min_gap:
        return
    _last_try = time.time()
    try:
        groups = group_by_id(fetch_rows(timeout=6))
        changed = False
        for m in db.query(Mechanic).filter(Mechanic.external_id != "", Mechanic.active.is_(True), Mechanic.share_enabled.is_(True)):
            pos = _latest_position(groups.get(m.external_id, []))
            if pos and (m.live_at is None or pos["at"] > (m.live_at if m.live_at.tzinfo else m.live_at.replace(tzinfo=timezone.utc))):
                _set_live(m, pos)
                if pos["photo"]:
                    m.photo_url = pos["photo"]
                changed = True
        if changed:
            db.commit()
    except Exception:
        db.rollback()

"""Reads a mechanics CSV (the sheet's ZONE_WISE_MECHANIC_DIRECTORY tab, or the dashboard's own export)
and works out what would be added or changed. Nothing is saved until commit=True."""
import csv
import io
import re
import secrets
from sqlalchemy.orm import Session
from .models import Mechanic, Zone, WhatsAppGroup
from .seed import normalize_zone_code, city_region

# CSV header -> field. Headers are matched without case, spaces or symbols.
COLUMNS = {
    "id": "code", "sno": "source_row", "zone": "zone", "location": "locality", "locality": "locality",
    "name": "name", "mechanicname": "name", "undertx": "under_tx", "gmapsname": "gmaps_name",
    "googlemapsname": "gmaps_name", "gmapslink": "gmaps_link", "googlemapslink": "gmaps_link",
    "workinghours": "working_hours", "rsagarage": "service_type", "servicetype": "service_type",
    "phone": "phone", "phonenumber": "phone", "altphone": "alt_phone", "whatsappgroup": "group",
    "coverageareas": "coverage_areas", "radiuskm": "radius_km", "latitude": "lat", "longitude": "lng",
    "garagename": "garage_name", "weeklyoff": "weekly_off", "notes": "notes",
}
TEXT_FIELDS = ["name", "under_tx", "gmaps_name", "gmaps_link", "locality", "working_hours", "service_type",
               "phone", "alt_phone", "coverage_areas", "garage_name", "weekly_off", "notes"]


def _key(h: str) -> str:
    return re.sub(r"[^a-z]", "", (h or "").lower())


def clean_service(raw: str) -> str:
    t = (raw or "").strip().lower()
    if not t:
        return ""
    if "puncture" in t:
        return "Puncture only"
    if "garage" in t and "rsa" in t:
        return "RSA + Garage"
    if "garage" in t:
        return "Garage"
    if "rsa" in t:
        return "RSA"
    return raw.strip()


def clean_row(raw: dict) -> tuple[dict, list[str]]:
    """Returns the cleaned values and a list of review flags."""
    flags = []
    row = {k: (v or "").strip() for k, v in raw.items()}
    hours = row.get("working_hours", "")
    if re.match(r"^\d{4}-\d{2}-\d{2}", hours) or re.match(r"^\d{1,2}/\d{1,2}/\d{4}$", hours):
        row["working_hours"] = "24/7"          # the sheet turned "24/7" into a date
        flags.append("hours_were_a_date")
    elif not hours and "working_hours" in row:
        flags.append("hours_missing")
    if "service_type" in row:
        row["service_type"] = clean_service(row["service_type"])
    if not row.get("name") and row.get("gmaps_name"):
        row["name"] = row["gmaps_name"]
        flags.append("name_taken_from_maps_name")
    if "locality" in row and not row["locality"]:
        flags.append("location_missing")
    return row, flags


def read_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig", "replace")
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader]
    # find the header row (the first row that has both a zone and a name column)
    for i, r in enumerate(rows[:15]):
        keys = [_key(c) for c in r]
        if "zone" in keys and ("name" in keys or "mechanicname" in keys):
            header, body = keys, rows[i + 1:]
            break
    else:
        raise ValueError("Could not find the header row. The file needs at least ZONE and Name columns.")
    out = []
    for r in body:
        item, extra = {}, []
        for h, cell in zip(header, r):
            cell = (cell or "").strip()
            if h in COLUMNS:
                item[COLUMNS[h]] = cell
            elif not h and cell:
                extra.append(cell)          # unlabeled columns in the sheet hold remarks
        if extra:
            item["notes"] = "; ".join(filter(None, [item.get("notes", "")] + extra))
        if item.get("name") or item.get("gmaps_name"):
            out.append(item)
    return out


def run_import(db: Session, content: bytes, commit: bool, user: str = "") -> dict:
    rows = read_csv(content)
    zones = {z.code: z for z in db.query(Zone)}
    groups = {g.name.lower(): g for g in db.query(WhatsAppGroup)}
    by_code = {m.code: m for m in db.query(Mechanic) if m.code}
    by_row = {m.source_row: m for m in db.query(Mechanic) if m.source_row}
    result = {"total_rows": len(rows), "new": [], "updates": [], "unchanged": 0, "problems": [], "new_zones": []}

    for n, raw in enumerate(rows, start=1):
        row, flags = clean_row(raw)
        label = row.get("name", "")
        zone_code = normalize_zone_code(row.get("zone", ""))
        if not zone_code:
            result["problems"].append({"row": row.get("source_row") or n, "name": label,
                                       "problem": f"Zone '{raw.get('zone', '')}' is not a known zone code"})
            continue
        if zone_code not in zones:
            city, region = city_region(zone_code)
            z = Zone(code=zone_code, name=row.get("locality", ""), city=city, region=region,
                     localities=row.get("locality", ""), notes="Created by import; set its centre on the map.")
            zones[zone_code] = z
            result["new_zones"].append(zone_code)
            if commit:
                db.add(z)
                db.flush()
        zone = zones[zone_code]
        existing = by_code.get(row.get("code", "")) or (by_row.get(row.get("source_row", "")) if not row.get("code") else None)
        if existing and not row.get("code") and existing.name.strip().lower() != label.lower():
            existing = None   # same sheet row number but a different person: treat as new

        values = {f: row[f] for f in TEXT_FIELDS if f in row}
        for f in ("lat", "lng", "radius_km"):
            if row.get(f):
                try:
                    values[f] = float(row[f])
                except ValueError:
                    result["problems"].append({"row": row.get("source_row") or n, "name": label,
                                               "problem": f"{f} '{row[f]}' is not a number"})
        group_name = row.get("group", "")

        if existing is None:
            result["new"].append({"row": row.get("source_row") or n, "name": label, "zone": zone_code, "flags": flags})
            if commit:
                m = Mechanic(zone=zone, source_row=row.get("source_row", ""), review_flags=",".join(flags),
                             track_token=secrets.token_urlsafe(12), updated_by=user, **values)
                db.add(m)
                db.flush()
                m.code = f"IM-{m.id:04d}"
                _set_group(db, m, group_name, groups)
        else:
            changes = {}
            for f, v in values.items():
                old = getattr(existing, f)
                if v not in ("", None) and v != old:
                    changes[f] = [old, v]
            if existing.zone_id != zone.id and zone.id is not None:
                changes["zone"] = [existing.zone.code if existing.zone else "", zone_code]
            if group_name and group_name.lower() not in [g.name.lower() for g in existing.groups]:
                changes["whatsapp_group"] = ["", group_name]
            if not changes:
                result["unchanged"] += 1
                continue
            result["updates"].append({"row": row.get("source_row") or n, "name": existing.name,
                                      "code": existing.code, "changes": changes})
            if commit:
                for f, (_, v) in changes.items():
                    if f == "zone":
                        existing.zone = zone
                    elif f == "whatsapp_group":
                        _set_group(db, existing, group_name, groups)
                    else:
                        setattr(existing, f, v)
                existing.updated_by = user
    if commit:
        db.commit()
    result["counts"] = {"new": len(result["new"]), "updates": len(result["updates"]),
                        "unchanged": result["unchanged"], "problems": len(result["problems"])}
    return result


def _set_group(db, mech, name, groups):
    if not name:
        return
    g = groups.get(name.lower())
    if not g:
        g = WhatsAppGroup(name=name, city=mech.zone.city if mech.zone else "")
        db.add(g)
        groups[name.lower()] = g
    if g not in mech.groups:
        mech.groups.append(g)

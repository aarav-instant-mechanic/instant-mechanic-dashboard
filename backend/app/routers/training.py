"""Location lookup and quizzes. Quiz questions are generated from the live data, never hardcoded."""
import random
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session
from ..common import iso, mechanic_json, position, zone_json
from ..db import get_db
from ..geo import km_between, parse_polygon, point_in_polygon
from ..models import Mechanic, QuizResult, User, Zone
from ..security import admin_user, current_user

router = APIRouter()


@router.get("/lookup")
def lookup(lat: float, lng: float, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Which zone is this point in, and which mechanics cover it?"""
    zones = db.query(Zone).filter(Zone.active.is_(True)).all()
    zone, how = None, ""
    for z in zones:
        pts = parse_polygon(z.polygon)
        if pts and point_in_polygon(lat, lng, pts):
            zone, how = z, "boundary"
            break
    if zone is None:
        with_centre = [z for z in zones if z.lat is not None]
        if with_centre:
            zone = min(with_centre, key=lambda z: km_between(lat, lng, z.lat, z.lng))
            how = "nearest_centre"   # boundaries not drawn yet, so this is a best guess
    admin = user.role == "admin"
    in_radius, in_zone = [], []
    for m in db.query(Mechanic).filter(Mechanic.active.is_(True)):
        pos = position(m)
        if pos["kind"] in ("live", "exact"):
            d = km_between(lat, lng, pos["lat"], pos["lng"])
            if d <= m.radius_km:
                in_radius.append({**mechanic_json(m, admin), "distance_km": round(d, 1)})
        elif zone and m.zone_id == zone.id:
            in_zone.append(mechanic_json(m, admin))
    in_radius.sort(key=lambda r: r["distance_km"])
    return {"zone": zone_json(zone) if zone else None, "zone_found_by": how,
            "distance_to_centre_km": round(km_between(lat, lng, zone.lat, zone.lng), 1) if zone and zone.lat else None,
            "covering": in_radius, "zone_mechanics_without_exact_location": in_zone}


def _options(rng, correct, pool, n=4):
    wrong = [p for p in dict.fromkeys(pool) if p and p != correct]
    rng.shuffle(wrong)
    opts = wrong[:n - 1] + [correct]
    rng.shuffle(opts)
    return opts if len(opts) >= 3 else None


@router.get("/quiz")
def quiz(city: str = "", count: int = 10, db: Session = Depends(get_db), user: User = Depends(current_user)):
    rng = random.Random()
    zones = [z for z in db.query(Zone).filter(Zone.active.is_(True)) if z.name and (not city or z.city == city)]
    mechs = [m for m in db.query(Mechanic).filter(Mechanic.active.is_(True)) if m.zone and (not city or m.zone.city == city)]
    name_count = {}
    for m in mechs:
        name_count[m.name.lower()] = name_count.get(m.name.lower(), 0) + 1
    qs = []
    for z in zones:
        same_city = [o.code for o in zones if o.city == z.city]
        opts = _options(rng, z.code, same_city + [o.code for o in zones])
        if opts:
            qs.append({"prompt": f"A customer is at {z.name}. Which zone is this?", "options": opts, "answer": z.code,
                       "explain": f"{z.name} is zone {z.code} ({z.region})."})
        opts = _options(rng, z.name, [o.name for o in zones if o.city == z.city] + [o.name for o in zones])
        if opts:
            qs.append({"prompt": f"Which area does zone {z.code} cover?", "options": opts, "answer": z.name,
                       "explain": f"Zone {z.code} covers {z.name}."})
    for m in mechs:
        unique = name_count[m.name.lower()] == 1
        if m.gmaps_name and m.gmaps_name.strip().lower() != m.name.strip().lower() and unique:
            opts = _options(rng, m.name, [o.name for o in mechs if o.zone.city == m.zone.city])
            if opts:
                qs.append({"prompt": f"On Google Maps a mechanic shows as \"{m.gmaps_name}\". What is his real name?",
                           "options": opts, "answer": m.name,
                           "explain": f"\"{m.gmaps_name}\" on Google Maps is {m.name}, zone {m.zone.code}."})
        if unique:
            opts = _options(rng, m.zone.code, [o.zone.code for o in mechs if o.zone.city == m.zone.city])
            if opts:
                shown = f"{m.name} (Maps name: {m.gmaps_name})" if m.gmaps_name and m.gmaps_name.lower() != m.name.lower() else m.name
                qs.append({"prompt": f"Which zone is {shown} in?", "options": opts, "answer": m.zone.code,
                           "explain": f"{m.name} is in {m.zone.code}, {m.zone.name}."})
            if m.groups:
                all_groups = [g.name for o in mechs for g in o.groups]
                opts = _options(rng, m.groups[0].name, all_groups)
                if opts and len(m.groups) == 1:
                    qs.append({"prompt": f"Which WhatsApp group is {m.name} in?", "options": opts,
                               "answer": m.groups[0].name, "explain": f"{m.name} is in the group \"{m.groups[0].name}\"."})
    rng.shuffle(qs)
    qs = qs[:max(1, min(count, 30))]
    for i, q in enumerate(qs):
        q["id"] = i + 1
    return {"city": city or "All", "questions": qs}


@router.post("/quiz/result")
def save_result(data: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    name = str(data.get("agent_name", "")).strip()[:120]
    score, total = int(data.get("score", 0)), int(data.get("total", 0))
    if not name or total < 1 or not 0 <= score <= total:
        raise HTTPException(400, "Enter your name before starting the quiz.")
    db.add(QuizResult(agent_name=name, city=str(data.get("city", "All"))[:60], score=score, total=total))
    db.commit()
    return {"ok": True}


@router.get("/quiz/results")
def results(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.query(QuizResult).order_by(QuizResult.id.desc()).limit(500).all()
    people = {}
    for r in rows:
        p = people.setdefault(r.agent_name.lower(), {"agent_name": r.agent_name, "attempts": 0, "best": 0, "last": None, "cities": set()})
        p["attempts"] += 1
        p["best"] = max(p["best"], round(100 * r.score / r.total))
        p["last"] = p["last"] or iso(r.at)
        p["cities"].add(r.city)
    return {"people": [{**p, "cities": sorted(p["cities"])} for p in people.values()],
            "attempts": [{"agent_name": r.agent_name, "city": r.city, "score": r.score, "total": r.total,
                          "at": iso(r.at)} for r in rows[:100]]}

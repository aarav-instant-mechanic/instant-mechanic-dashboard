"""Run with:  pytest      (uses a temporary database; your real data is not touched)"""
import os
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ.update(ADMIN_EMAIL="admin@test.local", ADMIN_PASSWORD="admin-pass-1",
                  AGENT_EMAIL="agents@test.local", AGENT_PASSWORD="agent-pass-1", SECRET_KEY="test-secret")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.geo import coords_from_text, point_in_polygon  # noqa: E402
from app.seed import normalize_zone_code  # noqa: E402

CSV = (Path(__file__).parent / "sample_mechanics.csv").read_bytes()


def login(c, who):
    r = c.post("/auth/login", json={"email": f"{who}@test.local", "password": f"{who.rstrip('s')}-pass-1"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_everything():
    with TestClient(app) as c:
        admin, agent = login(c, "admin"), login(c, "agents")

        # sign-in is required, and wrong passwords are refused
        assert c.get("/mechanics").status_code == 401
        assert c.post("/auth/login", json={"email": "admin@test.local", "password": "nope"}).status_code == 401

        # zones are seeded, including the gap zones
        zones = c.get("/zones", headers=agent).json()
        codes = {z["code"] for z in zones}
        assert {"G-3", "SD-7", "ED-1", "F-4", "G-4", "SD-10"} <= codes

        # import: preview saves nothing, commit saves
        prev = c.post("/import", files={"file": ("m.csv", CSV)}, headers=admin).json()
        assert prev["counts"] == {"new": 6, "updates": 0, "unchanged": 0, "problems": 1}
        assert c.get("/mechanics", headers=agent).json() == []
        assert c.post("/import", files={"file": ("m.csv", CSV)}, headers=agent).status_code == 403
        done = c.post("/import?commit=true", files={"file": ("m.csv", CSV)}, headers=admin).json()
        assert done["committed"] and done["counts"]["new"] == 6
        again = c.post("/import", files={"file": ("m.csv", CSV)}, headers=admin).json()
        assert again["counts"]["new"] == 0 and again["counts"]["unchanged"] == 6

        mechs = c.get("/mechanics", headers=admin).json()
        by_name = {m["gmaps_name"] or m["name"]: m for m in mechs}
        three = by_name["Test Three"]
        assert three["working_hours"] == "24/7" and "hours_were_a_date" in three["review_flags"]
        assert three["service_type"] == "RSA + Garage" and three["under_tx"] == "Lead Tech"
        assert by_name["Maps Only Shop"]["name"] == "Maps Only Shop"
        assert by_name["Five Car Care"]["service_type"] == "Puncture only" and by_name["Five Car Care"]["zone"] == "SD-10"
        assert by_name["Test Mechanic One"]["notes"] == "Not Puncture work"
        assert three["position"]["kind"] == "approximate"

        # Test 1 and 2: city and zone filters
        g = c.get("/mechanics?city=Gurugram", headers=agent).json()
        assert len(g) == 3 and all(m["city"] == "Gurugram" for m in g)
        assert len(c.get("/mechanics?zone=G-4", headers=agent).json()) == 2
        assert len(c.get("/mechanics?city=West Delhi", headers=agent).json()) == 1
        # Test 3: search by Maps name, locality and zone code
        assert [m["name"] for m in c.get("/mechanics?q=five car", headers=agent).json()] == ["Test Mechanic Five"]
        assert len(c.get("/mechanics?q=subash", headers=agent).json()) == 2
        assert len(c.get("/mechanics?q=g 4", headers=agent).json()) == 2
        # agents do not get admin-only fields
        assert "track_token" not in c.get("/mechanics", headers=agent).json()[0]

        # Test 4: add a mechanic (agent cannot)
        new = {"name": "New Person", "zone": "F-2", "phone": "9000000001", "working_hours": "9 am to 6 pm"}
        assert c.post("/mechanics", json=new, headers=agent).status_code == 403
        r = c.post("/mechanics", json=new, headers=admin).json()
        assert r["saved"] and r["mechanic"]["code"].startswith("IM-") and r["mechanic"]["city"] == "Faridabad"
        mid = r["mechanic"]["id"]
        # duplicate phone gives a warning first
        r2 = c.post("/mechanics", json={"name": "Copy", "zone": "F-2", "phone": "9000000001"}, headers=admin).json()
        assert r2["saved"] is False and r2["warnings"]

        # Test 5: edit hours, zone, group and exact location; changes persist
        grp = c.post("/groups", json={"name": "Faridabad Team", "city": "Faridabad"}, headers=admin).json()
        assert c.post("/groups", json={"name": "X", "link": "http://bad"}, headers=admin).status_code == 400
        up = c.put(f"/mechanics/{mid}", json={"working_hours": "24/7", "zone": "F-1", "group_ids": [grp["id"]],
                                               "exact_lat": 28.43, "exact_lng": 77.31, "radius_km": 7}, headers=admin).json()
        assert up["saved"]
        got = c.get(f"/mechanics/{mid}", headers=agent).json()
        assert got["working_hours"] == "24/7" and got["zone"] == "F-1" and got["position"]["kind"] == "exact"
        assert got["groups"][0]["name"] == "Faridabad Team"
        assert c.get("/mechanics?q=faridabad team", headers=agent).json()[0]["id"] == mid
        assert c.put(f"/mechanics/{mid}", json={"exact_lat": 10, "exact_lng": 10}, headers=admin).status_code == 400
        assert c.get(f"/groups/{grp['id']}", headers=agent).json()["members"] == 1

        # lookup: inside radius of the exact mechanic; nearest centre used when no boundary is drawn
        lk = c.get("/lookup?lat=28.432&lng=77.312", headers=agent).json()
        assert lk["zone_found_by"] == "nearest_centre" and lk["covering"][0]["id"] == mid
        # draw a boundary for F-1 and the lookup now uses it
        f1 = next(z for z in zones if z["code"] == "F-1")
        box = [[28.40, 77.29], [28.40, 77.34], [28.46, 77.34], [28.46, 77.29]]
        assert c.put(f"/zones/{f1['id']}", json={"polygon": box}, headers=agent).status_code == 403
        assert c.put(f"/zones/{f1['id']}", json={"polygon": box}, headers=admin).status_code == 200
        lk = c.get("/lookup?lat=28.432&lng=77.312", headers=agent).json()
        assert lk["zone_found_by"] == "boundary" and lk["zone"]["code"] == "F-1"

        # Test 7 and 11: numbers match the records; gap zones are reported
        st = c.get("/stats", headers=agent).json()
        assert st["mechanics"] == 7 and sum(x["mechanics"] for x in st["by_city"]) == 7
        assert sum(st["by_service"].values()) == 7
        assert "G-3" in [z["code"] for z in st["empty_zones"]]
        assert "G-4" not in [z["code"] for z in st["empty_zones"]]
        assert st["location"]["exact"] == 1 and st["missing"]["phone"] == 6

        # review list: flagged rows and the duplicate name
        rv = c.get("/review", headers=admin).json()
        assert any("Test Mechanic Two" == d["mechanics"][0]["name"] for d in rv["duplicates"])
        assert len(rv["flagged"]) >= 3
        assert c.get("/review", headers=agent).status_code == 403

        # live GPS: ignored until sharing is on; then live; both app formats work
        tok = c.get(f"/mechanics/{mid}", headers=admin).json()["track_token"]
        assert c.get(f"/gps?id={tok}&lat=28.5&lon=77.2").json()["ok"] is False
        c.post(f"/mechanics/{mid}/sharing", json={"enabled": True}, headers=admin)
        assert c.get(f"/gps?id={tok}&lat=28.5&lon=77.2").json()["ok"] is True
        pos = c.get(f"/mechanics/{mid}", headers=agent).json()["position"]
        assert pos["kind"] == "live" and pos["lat"] == 28.5
        body = {"device_id": tok, "location": {"coords": {"latitude": 28.6, "longitude": 77.3}}}
        assert c.post("/gps", json=body).json()["ok"] is True
        assert c.post(f"/share/{tok}", json={"lat": 28.61, "lng": 77.31}).status_code == 200
        assert c.get("/share/not-a-token").status_code == 404
        c.post(f"/mechanics/{mid}/sharing", json={"enabled": False}, headers=admin)
        assert c.get(f"/mechanics/{mid}", headers=agent).json()["position"]["kind"] == "exact"

        # quiz comes from the data; results are saved under the typed name
        qz = c.get("/quiz?count=8", headers=agent).json()["questions"]
        assert qz and all(q["answer"] in q["options"] for q in qz)
        assert c.post("/quiz/result", json={"agent_name": "Asha", "score": 6, "total": 8}, headers=agent).status_code == 200
        assert c.get("/quiz/results", headers=admin).json()["people"][0]["best"] == 75
        assert c.get("/quiz/results", headers=agent).status_code == 403

        # deactivate and restore
        c.post(f"/mechanics/{mid}/active", json={"active": False, "reason": "left"}, headers=admin)
        assert c.get(f"/mechanics/{mid}", headers=agent).status_code == 404
        assert len(c.get("/mechanics?active=false", headers=admin).json()) == 1
        c.post(f"/mechanics/{mid}/active", json={"active": True}, headers=admin)
        assert c.get(f"/mechanics/{mid}", headers=agent).status_code == 200

        # export (admin only) can be uploaded again and changes nothing
        assert c.get("/export", headers=agent).status_code == 403
        exp = c.get("/export", headers=admin)
        assert exp.status_code == 200 and "Test Mechanic One" in exp.text
        back = c.post("/import", files={"file": ("e.csv", exp.content)}, headers=admin).json()
        assert back["counts"]["new"] == 0 and back["counts"]["problems"] == 0, back
        # a bulk update through the export file: add a phone number
        edited = exp.text.replace("Test Mechanic One,,,,8 am to 11 pm,,RSA,,", "Test Mechanic One,,,,8 am to 11 pm,,RSA,9811111111,")
        assert edited != exp.text
        upd = c.post("/import?commit=true", files={"file": ("e.csv", edited.encode())}, headers=admin).json()
        assert upd["counts"]["updates"] == 1
        assert c.get("/mechanics?q=9811111111", headers=agent).json()[0]["name"] == "Test Mechanic One"

        # change history records who did what; admin can change the agent password
        actions = [a["action"] for a in c.get("/audit", headers=admin).json()]
        assert {"created", "updated", "deactivated", "restored", "imported", "sharing_on"} <= set(actions)
        assert c.post("/auth/password", json={"role": "agent", "password": "new-agent-pass"}, headers=admin).status_code == 200
        assert c.post("/auth/login", json={"email": "agents@test.local", "password": "new-agent-pass"}).status_code == 200


def test_helpers():
    assert normalize_zone_code("G - 1") == "G-1" and normalize_zone_code("sd10") == "SD-10"
    assert normalize_zone_code("G 4") == "G-4" and normalize_zone_code("hello") == ""
    assert coords_from_text("https://www.google.com/maps/place/X/@28.61,77.20,17z/data=!3d28.6139!4d77.2090") == (28.6139, 77.2090)
    assert coords_from_text("https://maps.google.com/?q=28.5,77.1") == (28.5, 77.1)
    assert coords_from_text("28.45, 77.02") == (28.45, 77.02)
    assert point_in_polygon(1, 1, [[0, 0], [0, 2], [2, 2], [2, 0]]) and not point_in_polygon(3, 1, [[0, 0], [0, 2], [2, 2], [2, 0]])

"""Usage:  python -m app.scripts.import_mechanics ..\\data\\mechanics.csv --preview
           python -m app.scripts.import_mechanics ..\\data\\mechanics.csv --commit"""
import sys
from pathlib import Path
from app import main  # noqa: F401  (loads .env)
from app.db import Base, SessionLocal, engine
from app.importer import run_import
from app.seed import seed_zones

if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[2] not in ("--preview", "--commit"):
        sys.exit(__doc__)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_zones(db)
        res = run_import(db, Path(sys.argv[1]).read_bytes(), commit=sys.argv[2] == "--commit", user="import script")
    c = res["counts"]
    print(f"Rows read: {res['total_rows']}  New: {c['new']}  Updates: {c['updates']}  Unchanged: {c['unchanged']}  Problems: {c['problems']}")
    for p in res["problems"]:
        print(f"  Row {p['row']} ({p['name']}): {p['problem']}")
    flagged = [n for n in res["new"] if n["flags"]]
    if flagged:
        print(f"Rows to confirm after import: {len(flagged)}")
        for n in flagged:
            print(f"  Row {n['row']} ({n['name']}): {', '.join(n['flags'])}")
    print("Saved." if sys.argv[2] == "--commit" else "Preview only. Nothing was saved. Run again with --commit to save.")

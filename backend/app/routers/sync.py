"""Admin: bring mechanics in from the company site. Preview first, then confirm."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..common import log
from ..db import get_db
from ..models import User
from ..security import admin_user
from .. import sync as site

router = APIRouter()


@router.post("/sync")
def sync_from_site(commit: bool = False, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    try:
        rows = site.fetch_rows()
    except ValueError as e:
        raise HTTPException(502, str(e))
    result = site.run_sync(db, rows, commit=commit, user=admin.email)
    if commit:
        log(db, admin.email, "synced", "site", "instantmechanic.online", result["counts"])
        db.commit()
    result["committed"] = commit
    return result

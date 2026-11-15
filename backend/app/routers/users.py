"""Logins. The Admin can add any number of Admin and Agent logins, reset passwords and remove logins.
A login can be an email or a simple username. Everyone can change their own password."""
import re
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session
from ..common import log
from ..db import get_db
from ..models import User
from ..security import admin_user, check_password, current_user, hash_password

router = APIRouter()
ROLES = ("admin", "agent")


def user_json(u: User, me: User | None = None) -> dict:
    return {"id": u.id, "login": u.email, "name": u.name or "", "role": u.role, "is_me": bool(me and me.id == u.id)}


def _login(value) -> str:
    login = str(value or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9._@+\-]{3,200}", login):
        raise HTTPException(400, "Login must be an email or a username of 3 or more letters or numbers, with no spaces.")
    return login


def _password(value) -> str:
    pw = str(value or "")
    if len(pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    return pw


def _admins(db: Session) -> int:
    return db.query(User).filter(User.role == "admin").count()


@router.get("/users")
def list_users(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.query(User).order_by(User.role, User.email).all()
    return [user_json(u, admin) for u in rows]


@router.post("/users")
def add_user(data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    login, pw = _login(data.get("login")), _password(data.get("password"))
    role = data.get("role")
    if role not in ROLES:
        raise HTTPException(400, "Choose Admin or Agent.")
    if db.query(User).filter(User.email == login).first():
        raise HTTPException(400, "This login already exists.")
    u = User(email=login, name=str(data.get("name") or "").strip()[:120], role=role, password_hash=hash_password(pw))
    db.add(u)
    log(db, admin.email, "created", "login", f"{role}: {login}")
    db.commit()
    return user_json(u, admin)


@router.put("/users/{uid}")
def update_user(uid: int, data: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Login not found.")
    done = []
    if "name" in data:
        u.name = str(data["name"] or "").strip()[:120]
        done.append("name")
    if "role" in data and data["role"] != u.role:
        if data["role"] not in ROLES:
            raise HTTPException(400, "Choose Admin or Agent.")
        if u.role == "admin" and _admins(db) <= 1:
            raise HTTPException(400, "There must always be at least one Admin.")
        u.role = data["role"]
        done.append(f"role {u.role}")
    if data.get("password"):
        u.password_hash = hash_password(_password(data["password"]))
        done.append("password reset")
    log(db, admin.email, "updated", "login", u.email, ", ".join(done))
    db.commit()
    return user_json(u, admin)


@router.delete("/users/{uid}")
def remove_user(uid: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Login not found.")
    if u.id == admin.id:
        raise HTTPException(400, "You cannot remove your own login.")
    if u.role == "admin" and _admins(db) <= 1:
        raise HTTPException(400, "There must always be at least one Admin.")
    log(db, admin.email, "deleted", "login", f"{u.role}: {u.email}")
    db.delete(u)
    db.commit()
    return {"ok": True}


@router.post("/me/password")
def change_my_password(data: dict = Body(...), me: User = Depends(current_user), db: Session = Depends(get_db)):
    if not check_password(str(data.get("current", "")), me.password_hash):
        raise HTTPException(400, "Your current password is not correct.")
    me.password_hash = hash_password(_password(data.get("new")))
    log(db, me.email, "password_changed", "login", me.email)
    db.commit()
    return {"ok": True}

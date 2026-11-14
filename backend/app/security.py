import os
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from .db import get_db
from .models import User

import secrets
# If SECRET_KEY is not set, a random one is used: safe, but everyone is signed out when the server restarts.
SECRET_KEY = os.getenv("SECRET_KEY", "").strip() or secrets.token_urlsafe(48)
TOKEN_HOURS = 12


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode()[:72], bcrypt.gensalt()).decode()


def check_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode()[:72], h.encode())
    except ValueError:
        return False


def make_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": user.email, "role": user.role, "exp": exp}, SECRET_KEY, algorithm="HS256")


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Please sign in.")
    try:
        data = jwt.decode(authorization[7:], SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Your session has ended. Please sign in again.")
    user = db.query(User).filter(User.email == data.get("sub")).first()
    if not user:
        raise HTTPException(401, "This login no longer exists.")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Only the Admin login can do this.")
    return user

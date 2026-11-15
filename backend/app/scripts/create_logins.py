"""Adds a login, or resets the password of an existing one. Other logins are not touched.
Usage:  python -m app.scripts.create_logins
Normally you add logins in the dashboard (Manage > Users). Use this if you are locked out."""
from getpass import getpass
from app import main  # noqa: F401  (loads .env)
from app.db import Base, SessionLocal, engine, ensure_columns
from app.models import User
from app.security import hash_password

if __name__ == "__main__":
    Base.metadata.create_all(engine)
    ensure_columns()
    with SessionLocal() as db:
        login = input("Email or username: ").strip().lower()
        if not login:
            raise SystemExit("Nothing entered.")
        role = input("Role, admin or agent [admin]: ").strip().lower() or "admin"
        if role not in ("admin", "agent"):
            raise SystemExit("Role must be admin or agent.")
        password = getpass("Password (at least 8 characters, not shown while typing): ")
        if len(password) < 8:
            raise SystemExit("Too short. Nothing saved.")
        u = db.query(User).filter(User.email == login).first()
        if u:
            u.password_hash, u.role = hash_password(password), role
            print(f"Password reset for {login} ({role}).")
        else:
            db.add(User(email=login, password_hash=hash_password(password), role=role, name=login.split("@")[0]))
            print(f"Login added: {login} ({role}).")
        db.commit()

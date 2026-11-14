"""Creates or resets the two logins.  Usage:  python -m app.scripts.create_logins"""
from getpass import getpass
from app import main  # noqa: F401  (loads .env)
from app.db import Base, SessionLocal, engine
from app.models import User
from app.security import hash_password

if __name__ == "__main__":
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for role in ("admin", "agent"):
            email = input(f"{role.title()} email (leave empty to skip): ").strip().lower()
            if not email:
                continue
            password = getpass(f"{role.title()} password (at least 8 characters, not shown while typing): ")
            if len(password) < 8:
                print("  Too short. Skipped.")
                continue
            for old in db.query(User).filter(User.role == role):
                db.delete(old)       # only one login per role
            db.flush()
            db.add(User(email=email, password_hash=hash_password(password), role=role))
            db.commit()
            print(f"  {role.title()} login saved: {email}")

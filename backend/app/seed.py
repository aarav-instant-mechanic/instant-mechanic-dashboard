"""Starting data: the zone list and the two logins.

Zone centres are approximate points placed on the main locality of each zone.
They are NOT boundaries. The Admin draws real boundaries in Manage > Zones.
Zones marked "map only" appear on the company zone map but not in the sheet's summary tab.
"""
import os
import re
from sqlalchemy.orm import Session
from .models import User, Zone
from .security import hash_password

PREFIX = {
    "G": ("Gurugram", "Gurugram"),
    "WD": ("Delhi", "West Delhi"), "ND": ("Delhi", "North Delhi"), "CD": ("Delhi", "Central Delhi"),
    "SD": ("Delhi", "South Delhi"), "ED": ("Delhi", "East Delhi"),
    "GZ": ("Ghaziabad", "Ghaziabad"), "N": ("Noida", "Noida"), "F": ("Faridabad", "Faridabad"),
    "GNW": ("Greater Noida", "Greater Noida West"), "GNE": ("Greater Noida", "Greater Noida East"),
    "GNM": ("Greater Noida", "Greater Noida"),
}
CITIES = ["Delhi", "Gurugram", "Noida", "Greater Noida", "Ghaziabad", "Faridabad"]


def normalize_zone_code(raw: str) -> str:
    """'G - 1', 'G 4', 'Sd-7', 'G9' -> 'G-1', 'G-4', 'SD-7', 'G-9'. Returns '' if it is not a zone code."""
    m = re.match(r"^\s*([A-Za-z]{1,3})\s*-?\s*(\d{1,2})\s*$", raw or "")
    if not m or m.group(1).upper() not in PREFIX:
        return ""
    return f"{m.group(1).upper()}-{int(m.group(2))}"


def city_region(code: str):
    return PREFIX.get(code.split("-")[0], ("", ""))


MAP_ONLY = "On the zone map only; not in the sheet summary. Confirm the area."
ZONES = [
    ("G-1", "Manesar", 28.354, 76.940, ""), ("G-2", "Badshahpur", 28.393, 77.050, ""),
    ("G-3", "Golf Course Ext / Sohna Road South", 28.415, 77.100, ""), ("G-4", "Subash Chowk", 28.428, 77.040, ""),
    ("G-5", "Sector 88", 28.425, 76.950, ""), ("G-6", "DLF", 28.475, 77.095, ""),
    ("G-7", "Sector 29", 28.468, 77.063, ""), ("G-8", "Palam Vihar", 28.508, 77.035, ""),
    ("G-9", "", 28.500, 76.990, MAP_ONLY),
    ("WD-1", "Dwarka", 28.592, 77.046, ""), ("WD-2", "Vikas Puri / Janakpuri", 28.633, 77.080, ""),
    ("WD-3", "Punjabi Bagh", 28.668, 77.132, ""),
    ("ND-1", "Rohini", 28.738, 77.115, ""), ("ND-2", "Pitampura / Model Town", 28.703, 77.150, ""),
    ("ND-3", "Burari", 28.752, 77.195, ""), ("ND-4", "Narela / Bawana", 28.820, 77.070, ""),
    ("ND-5", "Alipur / Jahangirpuri", 28.760, 77.150, ""), ("ND-6", "Model Town / Civil Lines", 28.700, 77.205, ""),
    ("ND-7", "", 28.672, 77.225, MAP_ONLY),
    ("CD-1", "Karol Bagh / Paharganj", 28.650, 77.195, ""), ("CD-2", "Mukherjee Nagar", 28.708, 77.213, ""),
    ("CD-3", "Connaught Place", 28.630, 77.218, ""),
    ("SD-1", "AirPort / Mahipalpur", 28.548, 77.125, ""), ("SD-2", "Saket / Hauz Khas", 28.535, 77.205, ""),
    ("SD-3", "Lajpat Nagar / Nehru Place", 28.562, 77.245, ""), ("SD-4", "Okhla Vihar", 28.555, 77.295, ""),
    ("SD-5", "Mehrauli / Chhatarpur", 28.508, 77.178, ""), ("SD-6", "Badarpur / Sarita Vihar", 28.512, 77.300, ""),
    ("SD-7", "Greater Kailash / Kalkaji / CR Park", 28.540, 77.250, ""),
    ("SD-8", "South Delhi Central / Batra", 28.515, 77.250, ""),
    ("SD-9", "", 28.495, 77.305, MAP_ONLY), ("SD-10", "Okhla (Sarita Vihar)", 28.530, 77.290, MAP_ONLY),
    ("ED-1", "Mayur Vihar Phase 1 / Akshardham", 28.612, 77.290, ""),
    ("ED-2", "Laxmi Nagar / Preet Vihar", 28.635, 77.285, ""), ("ED-3", "Mayur Vihar / Patparganj", 28.615, 77.305, ""),
    ("ED-4", "Shahdara / Dilshad Garden", 28.680, 77.305, ""), ("ED-5", "Anand Vihar / Vivek Vihar", 28.655, 77.315, ""),
    ("ED-6", "Seelampur / Yamuna Vihar", 28.690, 77.270, ""),
    ("GZ-1", "Sahibabad / Vasundhara / Shastri Nagar", 28.670, 77.360, ""),
    ("GZ-2", "Indirapuram / Kavi Nagar / Dasna", 28.655, 77.420, ""),
    ("N-1", "Sector 121", 28.598, 77.395, ""), ("N-2", "Sector 18 / Atta Market", 28.570, 77.326, ""),
    ("N-3", "Sector 62 / City Center", 28.625, 77.365, ""),
    ("N-4", "", 28.570, 77.400, MAP_ONLY), ("N-5", "", 28.500, 77.430, MAP_ONLY), ("N-6", "", 28.480, 77.380, MAP_ONLY),
    ("F-1", "Old Faridabad / Badarpur Border", 28.430, 77.315, ""), ("F-2", "NIT Faridabad", 28.395, 77.300, ""),
    ("F-3", "Ballabgarh / Sector 15", 28.345, 77.325, ""), ("F-4", "Central Faridabad / Sector 16-21", 28.415, 77.315, ""),
    ("F-5", "Greater Faridabad / Neharpar", 28.410, 77.355, ""),
    ("F-6", "", 28.420, 77.240, MAP_ONLY), ("F-7", "", 28.470, 77.250, MAP_ONLY),
    ("GNW-1", "Noida Extension / Greater Noida West", 28.605, 77.435, ""), ("GNM-1", "", 28.545, 77.460, MAP_ONLY),
    ("GNE-1", "Greater Noida Sector 150 Side", 28.435, 77.480, ""),
    ("GNE-2", "Greater Noida / Kasna Side", 28.470, 77.510, ""),
    ("GNE-3", "Kasna / Greater Noida East Side", 28.440, 77.540, ""),
]


def seed_zones(db: Session) -> int:
    have = {z.code for z in db.query(Zone.code)}
    added = 0
    for code, name, lat, lng, notes in ZONES:
        if code in have:
            continue
        city, region = city_region(code)
        db.add(Zone(code=code, name=name, city=city, region=region, localities=name, lat=lat, lng=lng, notes=notes))
        added += 1
    db.commit()
    return added


def seed_logins(db: Session) -> list[str]:
    """Creates the Admin and Agent logins from the .env values, only if they do not exist yet."""
    made = []
    a, b = os.getenv("ADMIN_EMAIL", "").strip().lower(), os.getenv("AGENT_EMAIL", "").strip().lower()
    if a and a == b:
        raise RuntimeError("ADMIN_EMAIL and AGENT_EMAIL in backend/.env are the same. Use two different emails, "
                           "save the file, and start the backend again.")
    for role in ("admin", "agent"):
        email = os.getenv(f"{role.upper()}_EMAIL", "").strip().lower()
        password = os.getenv(f"{role.upper()}_PASSWORD", "")
        if not email or not password:
            continue
        if not db.query(User).filter(User.email == email).first():
            db.add(User(email=email, password_hash=hash_password(password), role=role))
            made.append(f"{role}: {email}")
    db.commit()
    return made

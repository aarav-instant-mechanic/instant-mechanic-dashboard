from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


def now():
    return datetime.now(timezone.utc)


mechanic_groups = Table(
    "mechanic_groups", Base.metadata,
    Column("mechanic_id", ForeignKey("mechanics.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id", ForeignKey("whatsapp_groups.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))  # "admin" or "agent"


class Zone(Base):
    __tablename__ = "zones"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # e.g. "G-4"
    name: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(60), index=True)
    region: Mapped[str] = mapped_column(String(60), default="")
    localities: Mapped[str] = mapped_column(Text, default="")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)   # zone centre (approximate)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    polygon: Mapped[str] = mapped_column(Text, default="")            # JSON list of [lat, lng], drawn by admin
    notes: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    mechanics: Mapped[list["Mechanic"]] = relationship(back_populates="zone")


class WhatsAppGroup(Base):
    __tablename__ = "whatsapp_groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    link: Mapped[str] = mapped_column(String(400), default="")
    city: Mapped[str] = mapped_column(String(60), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    mechanics: Mapped[list["Mechanic"]] = relationship(secondary=mechanic_groups, back_populates="groups")


class Mechanic(Base):
    __tablename__ = "mechanics"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), default="", index=True)   # IM-0001
    name: Mapped[str] = mapped_column(String(200), index=True)
    under_tx: Mapped[str] = mapped_column(String(200), default="")
    gmaps_name: Mapped[str] = mapped_column(String(200), default="")
    gmaps_link: Mapped[str] = mapped_column(String(600), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    alt_phone: Mapped[str] = mapped_column(String(40), default="")
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zones.id"), nullable=True, index=True)
    locality: Mapped[str] = mapped_column(String(300), default="")
    coverage_areas: Mapped[str] = mapped_column(Text, default="")
    radius_km: Mapped[float] = mapped_column(Float, default=10.0)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)   # exact location set by admin
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    working_hours: Mapped[str] = mapped_column(String(100), default="")
    weekly_off: Mapped[str] = mapped_column(String(60), default="")
    service_type: Mapped[str] = mapped_column(String(40), default="")
    garage_name: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    review_flags: Mapped[str] = mapped_column(Text, default="")       # comma separated, cleared by admin
    source_row: Mapped[str] = mapped_column(String(20), default="", index=True)
    external_id: Mapped[str] = mapped_column(String(40), default="", index=True)   # ID on instantmechanic.online
    photo_url: Mapped[str] = mapped_column(String(500), default="")
    live_place: Mapped[str] = mapped_column(String(300), default="")               # address of the last shared position
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    # live location sharing
    track_token: Mapped[str] = mapped_column(String(40), default="", index=True)
    share_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    live_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    live_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    live_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    updated_by: Mapped[str] = mapped_column(String(200), default="")
    zone: Mapped[Zone | None] = relationship(back_populates="mechanics")
    groups: Mapped[list[WhatsAppGroup]] = relationship(secondary=mechanic_groups, back_populates="mechanics")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    user: Mapped[str] = mapped_column(String(200), default="")
    action: Mapped[str] = mapped_column(String(40))
    entity: Mapped[str] = mapped_column(String(40))
    entity_label: Mapped[str] = mapped_column(String(200), default="")
    detail: Mapped[str] = mapped_column(Text, default="")


class QuizResult(Base):
    __tablename__ = "quiz_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    agent_name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(60), default="All")
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)

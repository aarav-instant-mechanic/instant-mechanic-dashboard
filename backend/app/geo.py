"""Small geography helpers: distance, point-in-shape, and reading a Google Maps link."""
import json
import math
import re
import urllib.request


def km_between(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def parse_polygon(text: str) -> list[list[float]]:
    try:
        pts = json.loads(text) if text else []
        return [[float(p[0]), float(p[1])] for p in pts] if len(pts) >= 3 else []
    except (ValueError, TypeError, IndexError):
        return []


def point_in_polygon(lat: float, lng: float, pts: list[list[float]]) -> bool:
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        yi, xi = pts[i]
        yj, xj = pts[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


_PATTERNS = [
    r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)",          # the pinned place inside a long Maps link
    r"[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)",
    r"@(-?\d+\.\d+),(-?\d+\.\d+)",              # the map view centre
    r"^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$",  # plain "28.61, 77.20"
]


def coords_from_text(text: str):
    for pat in _PATTERNS:
        m = re.search(pat, text or "")
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return lat, lng
    return None


def coords_from_maps_link(link: str):
    """Returns (lat, lng) or None. Short links (maps.app.goo.gl) are opened once to find the full link."""
    link = (link or "").strip()
    found = coords_from_text(link)
    if found:
        return found
    if re.match(r"^https://(maps\.app\.goo\.gl|goo\.gl/maps|g\.co/kgs)/", link):
        try:
            req = urllib.request.Request(link, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                found = coords_from_text(resp.geturl())
                if found:
                    return found
                return coords_from_text(resp.read(200_000).decode("utf-8", "ignore"))
        except Exception:
            return None
    return None

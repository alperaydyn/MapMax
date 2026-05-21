"""
DB-backed memory operations: bookmarks, location insights, visit logs.
All functions are synchronous and take a SQLAlchemy session as their first argument.
"""
import json
from datetime import datetime
from typing import Optional

from database.models import Bookmark, LocationHistory, LocationInsight


# ---------------------------------------------------------------------------
# Bookmarks
# ---------------------------------------------------------------------------

def get_bookmarks(db, user_id: int) -> list:
    """Return all bookmarks for the user as a list of dicts."""
    bookmarks = (
        db.query(Bookmark)
        .filter(Bookmark.user_id == user_id)
        .order_by(Bookmark.created_at.desc())
        .all()
    )
    return [_bookmark_to_dict(b) for b in bookmarks]


def save_bookmark(
    db,
    user_id: int,
    name: str,
    lat: float,
    lng: float,
    place_id: str = None,
    address: str = None,
    category: str = "favorite",
) -> dict:
    """
    Create a new bookmark.  Returns the saved bookmark as a dict,
    or {"error": str} if a bookmark with that name already exists.
    """
    existing = (
        db.query(Bookmark)
        .filter(Bookmark.user_id == user_id, Bookmark.name == name)
        .first()
    )
    if existing:
        return {"error": f"Bookmark '{name}' already exists"}

    bookmark = Bookmark(
        user_id=user_id,
        name=name,
        latitude=lat,
        longitude=lng,
        place_id=place_id,
        address=address,
        category=category,
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return _bookmark_to_dict(bookmark)


def update_bookmark(
    db,
    user_id: int,
    bookmark_id: int = None,
    name: str = None,
    new_name: str = None,
    new_category: str = None,
) -> dict:
    """
    Update a bookmark's name and/or category.
    Lookup can be by id or by name.
    Returns the updated bookmark dict, or {"error": str}.
    """
    bookmark = _find_bookmark(db, user_id, bookmark_id=bookmark_id, name=name)
    if not bookmark:
        identifier = bookmark_id or name
        return {"error": f"Bookmark '{identifier}' not found"}

    if new_name is not None:
        bookmark.name = new_name
    if new_category is not None:
        bookmark.category = new_category

    db.commit()
    db.refresh(bookmark)
    return _bookmark_to_dict(bookmark)


def delete_bookmark(
    db,
    user_id: int,
    bookmark_id: int = None,
    name: str = None,
) -> bool:
    """
    Delete a bookmark by id or name.
    Returns True on success, False if not found.
    """
    bookmark = _find_bookmark(db, user_id, bookmark_id=bookmark_id, name=name)
    if not bookmark:
        return False
    db.delete(bookmark)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Location insights
# ---------------------------------------------------------------------------

def get_location_insights(db, user_id: int) -> list:
    """Return all learned location insights for the user."""
    insights = (
        db.query(LocationInsight)
        .filter(LocationInsight.user_id == user_id)
        .order_by(LocationInsight.confidence.desc())
        .all()
    )
    return [_insight_to_dict(i) for i in insights]


def resolve_named_location(db, user_id: int, name: str) -> Optional[dict]:
    """
    Resolve a named location (e.g. "home", "work", "gym", "school") or a
    bookmark name to {"lat", "lng", "address", "name"}.

    Search order:
    1. Exact bookmark name match (case-insensitive)
    2. Partial bookmark name match
    3. LocationInsight with matching insight_type
    Returns None if nothing found.
    """
    name_lower = name.lower().strip()

    # 1. Exact bookmark match
    bookmark = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.name.ilike(name_lower),
        )
        .first()
    )
    if bookmark:
        return {
            "lat": bookmark.latitude,
            "lng": bookmark.longitude,
            "address": bookmark.address or "",
            "name": bookmark.name,
        }

    # 2. Partial bookmark match
    bookmark = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.name.ilike(f"%{name_lower}%"),
        )
        .first()
    )
    if bookmark:
        return {
            "lat": bookmark.latitude,
            "lng": bookmark.longitude,
            "address": bookmark.address or "",
            "name": bookmark.name,
        }

    # 3. Insight type match (home, work, school, gym, frequent)
    insight = (
        db.query(LocationInsight)
        .filter(
            LocationInsight.user_id == user_id,
            LocationInsight.insight_type == name_lower,
        )
        .order_by(LocationInsight.confidence.desc())
        .first()
    )
    if insight:
        return {
            "lat": insight.latitude,
            "lng": insight.longitude,
            "address": insight.address or "",
            "name": insight.place_name or insight.insight_type,
        }

    return None


# ---------------------------------------------------------------------------
# Location visit logging
# ---------------------------------------------------------------------------

def log_location_visit(
    db,
    user_id: int,
    lat: float,
    lng: float,
    place_id: str,
    place_name: str,
    place_types: list,
    address: str,
) -> dict:
    """
    Log a location visit to history.
    If the most-recent open visit is within 100 m, skip (avoid duplicates).
    Returns the new (or existing open) LocationHistory record as a dict.
    """
    # Check for an open visit at the same place
    last = (
        db.query(LocationHistory)
        .filter(
            LocationHistory.user_id == user_id,
            LocationHistory.departed_at.is_(None),
        )
        .order_by(LocationHistory.arrived_at.desc())
        .first()
    )

    if last and _is_nearby(last.latitude, last.longitude, lat, lng, threshold_km=0.1):
        return _history_to_dict(last)

    # Close any previously open visit
    if last and last.departed_at is None:
        now = datetime.utcnow()
        last.departed_at = now
        delta = (now - last.arrived_at).total_seconds()
        last.duration_minutes = round(delta / 60, 1)
        db.commit()

    record = LocationHistory(
        user_id=user_id,
        latitude=lat,
        longitude=lng,
        place_id=place_id,
        place_name=place_name,
        place_types=json.dumps(place_types) if place_types else None,
        address=address,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _history_to_dict(record)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _find_bookmark(db, user_id: int, bookmark_id: int = None, name: str = None):
    if bookmark_id is not None:
        return (
            db.query(Bookmark)
            .filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id)
            .first()
        )
    if name is not None:
        return (
            db.query(Bookmark)
            .filter(Bookmark.user_id == user_id, Bookmark.name.ilike(name))
            .first()
        )
    return None


def _bookmark_to_dict(b: Bookmark) -> dict:
    return {
        "id": b.id,
        "name": b.name,
        "lat": b.latitude,
        "lng": b.longitude,
        "place_id": b.place_id,
        "address": b.address,
        "category": b.category,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "visit_count": b.visit_count,
        "last_visited": b.last_visited.isoformat() if b.last_visited else None,
    }


def _insight_to_dict(i: LocationInsight) -> dict:
    evidence = []
    if i.evidence:
        try:
            evidence = json.loads(i.evidence)
        except (json.JSONDecodeError, TypeError):
            evidence = []
    return {
        "id": i.id,
        "insight_type": i.insight_type,
        "lat": i.latitude,
        "lng": i.longitude,
        "place_name": i.place_name,
        "address": i.address,
        "confidence": i.confidence,
        "evidence": evidence,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


def _history_to_dict(h: LocationHistory) -> dict:
    types = []
    if h.place_types:
        try:
            types = json.loads(h.place_types)
        except (json.JSONDecodeError, TypeError):
            types = []
    return {
        "id": h.id,
        "lat": h.latitude,
        "lng": h.longitude,
        "place_id": h.place_id,
        "place_name": h.place_name,
        "place_types": types,
        "address": h.address,
        "arrived_at": h.arrived_at.isoformat() if h.arrived_at else None,
        "departed_at": h.departed_at.isoformat() if h.departed_at else None,
        "duration_minutes": h.duration_minutes,
    }


def _is_nearby(lat1, lng1, lat2, lng2, threshold_km: float = 0.1) -> bool:
    import math
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    distance_km = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return distance_km <= threshold_km

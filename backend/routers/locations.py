"""
Location tracking, bookmarks, insights, and history endpoints.
"""
import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Bookmark, LocationHistory, LocationInsight
from routers.auth import get_current_user
from database.models import User
from agent.tools.maps import reverse_geocode
from agent.tools.memory import (
    get_bookmarks as _get_bookmarks,
    save_bookmark as _save_bookmark,
    update_bookmark as _update_bookmark,
    delete_bookmark as _delete_bookmark,
    get_location_insights as _get_location_insights,
    get_preferences as _get_preferences,
    delete_preference as _delete_preference,
    log_location_visit,
)
from services.location_intelligence import analyze_user_patterns

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class LocationUpdateRequest(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[float] = None


class BookmarkCreateRequest(BaseModel):
    name: str
    lat: float
    lng: float
    place_id: Optional[str] = None
    address: Optional[str] = None
    category: Optional[str] = "favorite"


class BookmarkUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None


# ---------------------------------------------------------------------------
# Location tracking
# ---------------------------------------------------------------------------

@router.post("/update")
async def update_location(
    body: LocationUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Track the user's current position.
    Reverse-geocodes the coordinates, logs the visit, and triggers
    background intelligence analysis.
    """
    lat, lng = body.lat, body.lng

    # Reverse geocode to get place info
    geo = await reverse_geocode(lat, lng)
    address = ""
    place_id = ""
    place_name = ""
    place_types: list = []

    if "error" not in geo:
        address = geo.get("formatted_address", "")
        place_id = geo.get("place_id", "")
        place_types = geo.get("types", [])
        # Use first address component as a short place name
        parts = address.split(",")
        place_name = parts[0].strip() if parts else address

    # Log the visit synchronously via thread to avoid blocking event loop
    visit = await asyncio.to_thread(
        log_location_visit,
        db,
        current_user.id,
        lat,
        lng,
        place_id,
        place_name,
        place_types,
        address,
    )

    # Trigger pattern analysis in the background (non-blocking)
    asyncio.create_task(_run_analysis(db, current_user.id))

    return {
        "success": True,
        "visit": visit,
        "address": address,
        "place_name": place_name,
    }


async def _run_analysis(db, user_id: int):
    """Background task: run location intelligence analysis."""
    try:
        await asyncio.to_thread(analyze_user_patterns, db, user_id)
    except Exception:
        pass  # Don't let background failures surface to the user


# ---------------------------------------------------------------------------
# Bookmarks
# ---------------------------------------------------------------------------

@router.get("/bookmarks")
async def list_bookmarks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bookmarks = await asyncio.to_thread(_get_bookmarks, db, current_user.id)
    return {"bookmarks": bookmarks, "count": len(bookmarks)}


@router.post("/bookmarks", status_code=status.HTTP_201_CREATED)
async def create_bookmark(
    body: BookmarkCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = await asyncio.to_thread(
        _save_bookmark,
        db,
        current_user.id,
        body.name,
        body.lat,
        body.lng,
        body.place_id,
        body.address,
        body.category or "favorite",
    )
    if "error" in result:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result["error"])
    return result


@router.put("/bookmarks/{bookmark_id}")
async def update_bookmark_endpoint(
    bookmark_id: int,
    body: BookmarkUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = await asyncio.to_thread(
        _update_bookmark,
        db,
        current_user.id,
        bookmark_id,
        None,            # name lookup not used here
        body.name,       # new_name
        body.category,   # new_category
    )
    if "error" in result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=result["error"])
    return result


@router.delete("/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark_endpoint(
    bookmark_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    success = await asyncio.to_thread(
        _delete_bookmark, db, current_user.id, bookmark_id, None
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bookmark {bookmark_id} not found.",
        )


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

@router.get("/insights")
async def get_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    insights = await asyncio.to_thread(_get_location_insights, db, current_user.id)
    return {"insights": insights, "count": len(insights)}


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@router.get("/history")
async def get_history(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    def _fetch():
        records = (
            db.query(LocationHistory)
            .filter(LocationHistory.user_id == current_user.id)
            .order_by(LocationHistory.arrived_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "lat": r.latitude,
                "lng": r.longitude,
                "place_id": r.place_id,
                "place_name": r.place_name,
                "address": r.address,
                "arrived_at": r.arrived_at.isoformat() if r.arrived_at else None,
                "departed_at": r.departed_at.isoformat() if r.departed_at else None,
                "duration_minutes": r.duration_minutes,
            }
            for r in records
        ]

    history = await asyncio.to_thread(_fetch)
    return {"history": history, "count": len(history)}


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------

@router.get("/preferences")
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = await asyncio.to_thread(_get_preferences, db, current_user.id)
    return {"preferences": prefs, "count": len(prefs)}


@router.delete("/preferences/{preference_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preference_endpoint(
    preference_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    success = await asyncio.to_thread(
        _delete_preference, db, current_user.id, preference_id, None
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference not found")

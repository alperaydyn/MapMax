import httpx
from config import (
    GOOGLE_MAPS_API_KEY,
    GOOGLE_PLACES_TEXTSEARCH_URL,
    GOOGLE_PLACES_NEARBYSEARCH_URL,
    GOOGLE_PLACE_DETAILS_URL,
)
from agent.tools.maps import get_directions, sample_route_points


async def search_places(
    query: str,
    location: str,
    radius_meters: int = 5000,
) -> dict:
    """
    Search for places matching *query* near *location*.

    *location* can be a "lat,lng" string or a place name (geocoded server-side
    by the Places API itself).

    Returns:
        {"places": [...], "count": int}
        Each place: {"place_id", "name", "lat", "lng", "address", "types",
                     "rating", "open_now"}
    """
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "Google Maps API key not configured", "places": [], "count": 0}

    # Determine which endpoint to use
    # If location looks like "lat,lng" use nearbysearch, otherwise textsearch
    is_latlng = _is_latlng_string(location)

    if is_latlng:
        params = {
            "location": location,
            "radius": radius_meters,
            "keyword": query,
            "key": GOOGLE_MAPS_API_KEY,
        }
        url = GOOGLE_PLACES_NEARBYSEARCH_URL
    else:
        params = {
            "query": f"{query} near {location}",
            "key": GOOGLE_MAPS_API_KEY,
        }
        url = GOOGLE_PLACES_TEXTSEARCH_URL

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        return {
            "error": f"Places search failed: {data.get('status', 'UNKNOWN')}",
            "places": [],
            "count": 0,
        }

    places = []
    for item in data.get("results", []):
        geo = item.get("geometry", {}).get("location", {})
        oh = item.get("opening_hours", {})
        places.append(
            {
                "place_id": item.get("place_id", ""),
                "name": item.get("name", ""),
                "lat": geo.get("lat"),
                "lng": geo.get("lng"),
                "address": item.get("formatted_address") or item.get("vicinity", ""),
                "types": item.get("types", []),
                "rating": item.get("rating"),
                "open_now": oh.get("open_now"),
            }
        )

    return {"places": places, "count": len(places)}


async def get_place_details(place_id: str) -> dict:
    """
    Fetch detailed information about a place from the Google Place Details API.

    Returns a dict with all available fields or {"error": str}.
    """
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "Google Maps API key not configured"}

    fields = (
        "place_id,name,formatted_address,geometry,types,rating,user_ratings_total,"
        "opening_hours,formatted_phone_number,website,price_level,reviews,photos"
    )
    params = {
        "place_id": place_id,
        "fields": fields,
        "key": GOOGLE_MAPS_API_KEY,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GOOGLE_PLACE_DETAILS_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "OK":
        return {"error": f"Place details failed: {data.get('status', 'UNKNOWN')}"}

    result = data.get("result", {})
    geo = result.get("geometry", {}).get("location", {})
    oh = result.get("opening_hours", {})

    return {
        "place_id": result.get("place_id", place_id),
        "name": result.get("name", ""),
        "formatted_address": result.get("formatted_address", ""),
        "lat": geo.get("lat"),
        "lng": geo.get("lng"),
        "types": result.get("types", []),
        "rating": result.get("rating"),
        "user_ratings_total": result.get("user_ratings_total"),
        "open_now": oh.get("open_now"),
        "weekday_text": oh.get("weekday_text", []),
        "phone": result.get("formatted_phone_number"),
        "website": result.get("website"),
        "price_level": result.get("price_level"),
        "reviews": [
            {
                "author": r.get("author_name"),
                "rating": r.get("rating"),
                "text": r.get("text"),
                "time": r.get("relative_time_description"),
            }
            for r in result.get("reviews", [])[:3]  # limit to 3 reviews
        ],
    }


async def search_along_route(
    encoded_polyline: str,
    query: str,
    radius_meters: int = 2000,
) -> dict:
    """
    Search for places matching *query* at sampled points along an encoded polyline.

    Deduplicates results by place_id.

    Returns:
        {"places": [...], "count": int}
    """
    if not encoded_polyline:
        return {"places": [], "count": 0, "error": "No polyline provided"}

    sample_points = await sample_route_points(encoded_polyline, interval_km=5.0)

    if not sample_points:
        return {"places": [], "count": 0}

    seen_ids: set = set()
    all_places: list = []

    for point in sample_points:
        location_str = f"{point['lat']},{point['lng']}"
        result = await search_places(
            query=query,
            location=location_str,
            radius_meters=radius_meters,
        )
        for place in result.get("places", []):
            pid = place.get("place_id")
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                all_places.append(place)

    return {"places": all_places, "count": len(all_places)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_latlng_string(s: str) -> bool:
    """Return True if s looks like a 'lat,lng' coordinate pair."""
    parts = s.split(",")
    if len(parts) != 2:
        return False
    try:
        float(parts[0].strip())
        float(parts[1].strip())
        return True
    except ValueError:
        return False

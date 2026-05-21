import math
import httpx
from config import GOOGLE_MAPS_API_KEY, GOOGLE_GEOCODE_URL, GOOGLE_DIRECTIONS_URL


async def geocode(address: str) -> dict:
    """
    Convert an address string to lat/lng coordinates.

    Returns:
        {"lat": float, "lng": float, "formatted_address": str}
        or {"error": str} on failure.
    """
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "Google Maps API key not configured"}

    params = {"address": address, "key": GOOGLE_MAPS_API_KEY}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GOOGLE_GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "OK" or not data.get("results"):
        return {"error": f"Geocode failed: {data.get('status', 'UNKNOWN')}"}

    result = data["results"][0]
    loc = result["geometry"]["location"]
    return {
        "lat": loc["lat"],
        "lng": loc["lng"],
        "formatted_address": result.get("formatted_address", address),
    }


async def reverse_geocode(lat: float, lng: float) -> dict:
    """
    Convert lat/lng to a human-readable address.

    Returns:
        {"formatted_address": str, "place_id": str, "types": list}
        or {"error": str} on failure.
    """
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "Google Maps API key not configured"}

    params = {"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GOOGLE_GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "OK" or not data.get("results"):
        return {"error": f"Reverse geocode failed: {data.get('status', 'UNKNOWN')}"}

    result = data["results"][0]
    return {
        "formatted_address": result.get("formatted_address", ""),
        "place_id": result.get("place_id", ""),
        "types": result.get("types", []),
    }


async def get_directions(
    origin: str,
    destination: str,
    waypoints: list = None,
    mode: str = "driving",
) -> dict:
    """
    Get directions between two locations using the Google Directions API.

    Returns:
        {
            "encoded_polyline": str,
            "distance_text": str,
            "duration_text": str,
            "distance_meters": int,
            "duration_seconds": int,
            "legs": list,
            "steps": list,
            "bounds": dict,
            "origin_latlng": dict,
            "destination_latlng": dict,
        }
        or {"error": str} on failure.
    """
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "Google Maps API key not configured"}

    params = {
        "origin": origin,
        "destination": destination,
        "mode": mode,
        "key": GOOGLE_MAPS_API_KEY,
    }

    if waypoints:
        params["waypoints"] = "|".join(waypoints)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(GOOGLE_DIRECTIONS_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "OK" or not data.get("routes"):
        return {"error": f"Directions failed: {data.get('status', 'UNKNOWN')}"}

    route = data["routes"][0]
    legs = route.get("legs", [])

    # Aggregate distance and duration across all legs
    total_distance_m = sum(leg.get("distance", {}).get("value", 0) for leg in legs)
    total_duration_s = sum(leg.get("duration", {}).get("value", 0) for leg in legs)

    # Build a flat step list from all legs
    all_steps = []
    for leg in legs:
        for step in leg.get("steps", []):
            all_steps.append(
                {
                    "instruction": step.get("html_instructions", ""),
                    "distance_text": step.get("distance", {}).get("text", ""),
                    "duration_text": step.get("duration", {}).get("text", ""),
                    "distance_meters": step.get("distance", {}).get("value", 0),
                    "duration_seconds": step.get("duration", {}).get("value", 0),
                    "start_location": step.get("start_location", {}),
                    "end_location": step.get("end_location", {}),
                    "maneuver": step.get("maneuver", ""),
                }
            )

    first_leg = legs[0] if legs else {}
    last_leg = legs[-1] if legs else {}

    return {
        "encoded_polyline": route.get("overview_polyline", {}).get("points", ""),
        "distance_text": _format_distance(total_distance_m),
        "duration_text": _format_duration(total_duration_s),
        "distance_meters": total_distance_m,
        "duration_seconds": total_duration_s,
        "legs": legs,
        "steps": all_steps,
        "bounds": route.get("bounds", {}),
        "origin_latlng": first_leg.get("start_location", {}),
        "destination_latlng": last_leg.get("end_location", {}),
    }


def decode_polyline(encoded: str) -> list:
    """
    Decode a Google Maps encoded polyline string into a list of lat/lng dicts.

    Returns:
        [{"lat": float, "lng": float}, ...]
    """
    points = []
    index = lat = lng = 0
    while index < len(encoded):
        for coord_idx in range(2):
            result = shift = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if coord_idx == 0:
                lat += delta
            else:
                lng += delta
                points.append({"lat": lat * 1e-5, "lng": lng * 1e-5})
    return points


async def sample_route_points(encoded_polyline: str, interval_km: float = 5.0) -> list:
    """
    Decode a polyline and return a sampled subset of points spaced ~interval_km apart.

    Returns:
        [{"lat": float, "lng": float}, ...]
    """
    if not encoded_polyline:
        return []

    all_points = decode_polyline(encoded_polyline)
    if not all_points:
        return []

    sampled = [all_points[0]]
    accumulated_km = 0.0

    for i in range(1, len(all_points)):
        prev = all_points[i - 1]
        curr = all_points[i]
        accumulated_km += _haversine_km(prev["lat"], prev["lng"], curr["lat"], curr["lng"])
        if accumulated_km >= interval_km:
            sampled.append(curr)
            accumulated_km = 0.0

    # Always include the last point
    if sampled[-1] != all_points[-1]:
        sampled.append(all_points[-1])

    return sampled


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in km between two lat/lng points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _format_distance(meters: int) -> str:
    if meters >= 1000:
        return f"{meters / 1000:.1f} km"
    return f"{meters} m"


def _format_duration(seconds: int) -> str:
    minutes = seconds // 60
    if minutes >= 60:
        hours = minutes // 60
        mins = minutes % 60
        return f"{hours} hr {mins} min" if mins else f"{hours} hr"
    return f"{minutes} min"

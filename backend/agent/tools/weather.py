import httpx
from config import WEATHER_API_KEY, OPENWEATHER_BASE_URL


async def get_weather(lat: float, lng: float) -> dict:
    """
    Fetch current weather at the given coordinates from OpenWeatherMap.

    Returns:
        {
            "temp_c": float,
            "feels_like_c": float,
            "description": str,
            "icon": str,
            "humidity": int,
            "wind_speed": float,   # m/s
            "city": str,
        }
        or {"error": str} on failure.
    """
    if not WEATHER_API_KEY:
        return {"error": "Weather API key not configured"}

    params = {
        "lat": lat,
        "lon": lng,
        "appid": WEATHER_API_KEY,
        "units": "metric",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{OPENWEATHER_BASE_URL}/weather", params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("cod") not in (200, "200"):
        return {"error": f"Weather API error: {data.get('message', 'unknown')}"}

    main = data.get("main", {})
    weather_list = data.get("weather", [{}])
    wind = data.get("wind", {})

    return {
        "temp_c": main.get("temp"),
        "feels_like_c": main.get("feels_like"),
        "description": weather_list[0].get("description", ""),
        "icon": weather_list[0].get("icon", ""),
        "humidity": main.get("humidity"),
        "wind_speed": wind.get("speed"),
        "city": data.get("name", ""),
    }


async def get_weather_at_destination(
    lat: float, lng: float, eta_seconds: int = 0
) -> dict:
    """
    Return weather at a destination, using forecast data if the ETA is more
    than one hour away, otherwise return current weather.

    Returns the same shape as get_weather(), plus an optional "forecast_time" key.
    """
    if not WEATHER_API_KEY:
        return {"error": "Weather API key not configured"}

    ONE_HOUR = 3600

    if eta_seconds <= ONE_HOUR:
        return await get_weather(lat, lng)

    # Use 3-hour forecast endpoint and find the closest future slot
    params = {
        "lat": lat,
        "lon": lng,
        "appid": WEATHER_API_KEY,
        "units": "metric",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{OPENWEATHER_BASE_URL}/forecast", params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("cod") not in (200, "200"):
        # Fall back to current weather
        return await get_weather(lat, lng)

    import time as _time

    target_ts = _time.time() + eta_seconds
    entries = data.get("list", [])

    best = None
    best_diff = float("inf")
    for entry in entries:
        diff = abs(entry.get("dt", 0) - target_ts)
        if diff < best_diff:
            best_diff = diff
            best = entry

    if not best:
        return await get_weather(lat, lng)

    main = best.get("main", {})
    weather_list = best.get("weather", [{}])
    wind = best.get("wind", {})
    city_name = data.get("city", {}).get("name", "")

    return {
        "temp_c": main.get("temp"),
        "feels_like_c": main.get("feels_like"),
        "description": weather_list[0].get("description", ""),
        "icon": weather_list[0].get("icon", ""),
        "humidity": main.get("humidity"),
        "wind_speed": wind.get("speed"),
        "city": city_name,
        "forecast_time": best.get("dt_txt", ""),
    }

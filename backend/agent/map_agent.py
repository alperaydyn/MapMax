"""
MapMax AI agent powered by OpenRouter (OpenAI-compatible API) with tool calling.
"""
import json
import os
from datetime import datetime
from typing import Optional

import httpx

from agent.tools.maps import get_directions, geocode, reverse_geocode
from agent.tools.places import search_places, get_place_details, search_along_route as _search_along_route
from agent.tools.weather import get_weather, get_weather_at_destination
from agent.tools.memory import (
    get_bookmarks,
    save_bookmark,
    update_bookmark,
    delete_bookmark,
    get_location_insights,
    resolve_named_location,
)


class MapAgent:
    """
    Orchestrates LLM calls (via OpenRouter) and map/place/weather tool execution.
    """

    def __init__(self):
        self.model = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")
        self.api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.base_url = "https://openrouter.ai/api/v1"
        self.tools = self._define_tools()

    # ------------------------------------------------------------------
    # Tool schema definitions (OpenAI function-calling format)
    # ------------------------------------------------------------------

    def _define_tools(self) -> list:
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_directions",
                    "description": (
                        "Get turn-by-turn driving (or walking/transit) directions between two locations. "
                        "Returns route polyline, distance, duration, and step-by-step instructions."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "origin": {
                                "type": "string",
                                "description": "Starting location: address, place name, or 'lat,lng'.",
                            },
                            "destination": {
                                "type": "string",
                                "description": "Ending location: address, place name, or 'lat,lng'.",
                            },
                            "waypoints": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Optional list of intermediate waypoints.",
                            },
                            "mode": {
                                "type": "string",
                                "enum": ["driving", "walking", "bicycling", "transit"],
                                "description": "Travel mode. Defaults to 'driving'.",
                            },
                        },
                        "required": ["origin", "destination"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_places",
                    "description": (
                        "Search for places (restaurants, gas stations, ATMs, etc.) near a location."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "What to search for, e.g. 'coffee shop', 'pharmacy'.",
                            },
                            "location": {
                                "type": "string",
                                "description": "Center of search: address, place name, or 'lat,lng'.",
                            },
                            "radius_meters": {
                                "type": "integer",
                                "description": "Search radius in meters (default 5000).",
                            },
                        },
                        "required": ["query", "location"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_along_route",
                    "description": (
                        "Find places of interest along a driving route between origin and destination. "
                        "Useful for 'find gas stations on the way to the airport' type queries."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "origin": {
                                "type": "string",
                                "description": "Route start: address, place name, or 'lat,lng'.",
                            },
                            "destination": {
                                "type": "string",
                                "description": "Route end: address, place name, or 'lat,lng'.",
                            },
                            "query": {
                                "type": "string",
                                "description": "What to search for along the route.",
                            },
                            "radius_meters": {
                                "type": "integer",
                                "description": "Search radius around each route point in meters (default 2000).",
                            },
                        },
                        "required": ["origin", "destination", "query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_place_details",
                    "description": "Get detailed information about a specific place using its place_id.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "place_id": {
                                "type": "string",
                                "description": "The Google Maps place_id of the place.",
                            },
                        },
                        "required": ["place_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": (
                        "Get current weather at a location. "
                        "Provide either a 'lat,lng' string or a place name."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {
                                "type": "string",
                                "description": "Location as 'lat,lng' or an address/place name.",
                            },
                            "eta_seconds": {
                                "type": "integer",
                                "description": (
                                    "Seconds until arrival at the location. "
                                    "If > 3600, the forecast endpoint is used instead of current weather."
                                ),
                            },
                        },
                        "required": ["location"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "save_bookmark",
                    "description": "Save a place as a bookmark so the user can refer to it by name later.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "A memorable name for this bookmark (e.g. 'Home', 'Gym').",
                            },
                            "location": {
                                "type": "string",
                                "description": "Address or 'lat,lng' of the place to bookmark.",
                            },
                            "category": {
                                "type": "string",
                                "description": "Category label such as 'home', 'work', 'favorite', 'gym', etc.",
                            },
                        },
                        "required": ["name", "location"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "update_bookmark",
                    "description": "Rename a bookmark or change its category.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "bookmark_name": {
                                "type": "string",
                                "description": "Current name of the bookmark to update.",
                            },
                            "new_name": {
                                "type": "string",
                                "description": "New name to assign to the bookmark.",
                            },
                            "new_category": {
                                "type": "string",
                                "description": "New category to assign.",
                            },
                        },
                        "required": ["bookmark_name"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "delete_bookmark",
                    "description": "Remove a saved bookmark by name.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "bookmark_name": {
                                "type": "string",
                                "description": "Name of the bookmark to delete.",
                            },
                        },
                        "required": ["bookmark_name"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_bookmarks",
                    "description": "List all of the user's saved bookmarks.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_location_insights",
                    "description": (
                        "Retrieve learned location patterns for the user, such as detected home, "
                        "work, gym, or frequently visited places."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "resolve_location",
                    "description": (
                        "Resolve a named location like 'home', 'work', 'gym', 'school', or any bookmark "
                        "name to actual coordinates and an address. "
                        "Use this before get_directions when the user says 'take me home' or 'go to work'."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "The location name to resolve (e.g. 'home', 'work', 'Mom's house').",
                            },
                        },
                        "required": ["name"],
                    },
                },
            },
        ]

    # ------------------------------------------------------------------
    # System prompt
    # ------------------------------------------------------------------

    def build_system_prompt(
        self,
        user_name: str,
        current_location: dict,
        bookmarks: list,
        insights: list,
    ) -> str:
        now = datetime.now().strftime("%A, %B %d, %Y at %I:%M %p")

        location_str = "Unknown"
        if current_location:
            lat = current_location.get("lat")
            lng = current_location.get("lng")
            addr = current_location.get("address", "")
            if lat and lng:
                location_str = f"{lat:.6f},{lng:.6f}"
                if addr:
                    location_str = f"{addr} ({lat:.6f},{lng:.6f})"

        # Format bookmarks
        bookmark_lines = []
        for b in bookmarks:
            addr = b.get("address") or "{}, {}".format(b["lat"], b["lng"])
            bookmark_lines.append(
                f"  - {b['name']} ({b.get('category', 'favorite')}): {addr}"
            )
        bookmarks_str = "\n".join(bookmark_lines) if bookmark_lines else "  None saved yet."

        # Format insights
        insight_lines = []
        for ins in insights:
            ins_addr = ins.get("address") or "{}, {}".format(ins["lat"], ins["lng"])
            insight_lines.append(
                f"  - {ins['insight_type'].capitalize()}: "
                f"{ins.get('place_name') or 'Unknown'} "
                f"({ins_addr}), "
                f"confidence: {ins['confidence']:.0%}"
            )
        insights_str = "\n".join(insight_lines) if insight_lines else "  No patterns detected yet."

        return f"""You are MapMax, a friendly and helpful AI map assistant.

Current time: {now}
User name: {user_name}
User's current location: {location_str}

User's saved bookmarks:
{bookmarks_str}

Learned location patterns:
{insights_str}

## Your capabilities
- Get turn-by-turn directions (driving, walking, transit, cycling)
- Search for nearby places (restaurants, gas stations, ATMs, etc.)
- Find places along a route
- Get current and forecast weather
- Save, update, and delete location bookmarks
- Recall learned patterns (home, work, gym, etc.)
- Resolve named locations like "home" or "work" to real coordinates

## Guidelines
- When a user mentions a named place ("home", "work", "gym"), call resolve_location first.
- For route queries, always call get_directions and return the map action.
- Be concise but helpful. Distances in km/miles, durations in human-readable form.
- If a tool call fails, tell the user clearly and suggest alternatives.
- Always confirm actions (saved bookmark, started navigation) in your response.
- IMPORTANT: When the user asks for something "near me", "nearby", "around me", or "close to me", always pass the exact string "current location" as the `location` parameter to search_places or get_directions. Never pass "near me" literally as a location — the system will automatically substitute the user's real GPS coordinates for "current location".
- IMPORTANT: The user's current location coordinates above are their real GPS position. Use those coordinates directly (as "lat,lng") or use "current location" when calling tools.
"""

    # ------------------------------------------------------------------
    # Tool execution
    # ------------------------------------------------------------------

    async def execute_tool(
        self,
        tool_name: str,
        tool_args: dict,
        user_id: int,
        db,
        current_location: dict,
    ) -> tuple[dict, Optional[dict]]:
        """
        Execute a named tool with the given arguments.

        Returns (tool_result_dict, map_action_or_None).
        """
        map_action = None

        try:
            if tool_name == "get_directions":
                origin = tool_args.get("origin", "")
                destination = tool_args.get("destination", "")
                if _is_near_me(origin) and current_location:
                    lat = current_location.get("lat")
                    lng = current_location.get("lng")
                    if lat and lng:
                        origin = f"{lat},{lng}"

                result = await get_directions(
                    origin=origin,
                    destination=destination,
                    waypoints=tool_args.get("waypoints"),
                    mode=tool_args.get("mode", "driving"),
                )
                if "error" not in result:
                    map_action = {
                        "type": "navigate",
                        "route": {
                            "encoded_polyline": result.get("encoded_polyline"),
                            "distance_text": result.get("distance_text"),
                            "duration_text": result.get("duration_text"),
                            "distance_meters": result.get("distance_meters"),
                            "duration_seconds": result.get("duration_seconds"),
                            "steps": result.get("steps", []),
                            "bounds": result.get("bounds"),
                        },
                        "origin": result.get("origin_latlng"),
                        "destination": result.get("destination_latlng"),
                    }
                return result, map_action

            elif tool_name == "search_places":
                location = tool_args.get("location", "")
                if _is_near_me(location) and current_location:
                    lat = current_location.get("lat")
                    lng = current_location.get("lng")
                    if lat and lng:
                        location = f"{lat},{lng}"
                elif not location and current_location:
                    lat = current_location.get("lat")
                    lng = current_location.get("lng")
                    if lat and lng:
                        location = f"{lat},{lng}"

                result = await search_places(
                    query=tool_args.get("query", ""),
                    location=location,
                    radius_meters=tool_args.get("radius_meters", 5000),
                )
                if "error" not in result and result.get("places"):
                    places = result["places"]
                    center = None
                    if current_location:
                        center = {
                            "lat": current_location.get("lat"),
                            "lng": current_location.get("lng"),
                        }
                    elif places:
                        center = {"lat": places[0]["lat"], "lng": places[0]["lng"]}
                    map_action = {
                        "type": "show_places",
                        "places": places,
                        "center": center,
                        "query": tool_args.get("query"),
                    }
                return result, map_action

            elif tool_name == "search_along_route":
                origin = tool_args.get("origin", "")
                destination = tool_args.get("destination", "")
                if _is_near_me(origin) and current_location:
                    lat = current_location.get("lat")
                    lng = current_location.get("lng")
                    if lat and lng:
                        origin = f"{lat},{lng}"

                directions = await get_directions(origin=origin, destination=destination)
                if "error" in directions:
                    return directions, None

                encoded_polyline = directions.get("encoded_polyline", "")
                result = await _search_along_route(
                    encoded_polyline=encoded_polyline,
                    query=tool_args.get("query", ""),
                    radius_meters=tool_args.get("radius_meters", 2000),
                )
                # Add route info to result for the response
                result["route"] = {
                    "encoded_polyline": encoded_polyline,
                    "distance_text": directions.get("distance_text"),
                    "duration_text": directions.get("duration_text"),
                    "origin_latlng": directions.get("origin_latlng"),
                    "destination_latlng": directions.get("destination_latlng"),
                    "bounds": directions.get("bounds"),
                }
                if result.get("places"):
                    map_action = {
                        "type": "show_places_along_route",
                        "places": result["places"],
                        "route": result["route"],
                    }
                return result, map_action

            elif tool_name == "get_place_details":
                result = await get_place_details(tool_args.get("place_id", ""))
                if "error" not in result and result.get("lat") and result.get("lng"):
                    map_action = {
                        "type": "show_place_detail",
                        "place": result,
                        "center": {"lat": result["lat"], "lng": result["lng"]},
                    }
                return result, map_action

            elif tool_name == "get_weather":
                location_str = tool_args.get("location", "")
                eta_seconds = tool_args.get("eta_seconds", 0)

                # Parse lat/lng from location string
                lat, lng = _parse_latlng(location_str)
                if lat is None:
                    # Geocode the location string
                    geo = await geocode(location_str)
                    if "error" in geo:
                        return geo, None
                    lat, lng = geo["lat"], geo["lng"]

                result = await get_weather_at_destination(lat, lng, eta_seconds)
                return result, None

            elif tool_name == "save_bookmark":
                location_str = tool_args.get("location", "")
                name = tool_args.get("name", "")
                category = tool_args.get("category", "favorite")

                lat, lng = _parse_latlng(location_str)
                address = None
                if lat is None:
                    geo = await geocode(location_str)
                    if "error" in geo:
                        return geo, None
                    lat, lng = geo["lat"], geo["lng"]
                    address = geo.get("formatted_address")
                else:
                    # Reverse geocode to get address
                    from agent.tools.maps import reverse_geocode
                    rev = await reverse_geocode(lat, lng)
                    if "error" not in rev:
                        address = rev.get("formatted_address")

                import asyncio
                result = await asyncio.to_thread(
                    save_bookmark,
                    db, user_id, name, lat, lng, None, address, category
                )
                if "error" not in result:
                    bookmarks = await asyncio.to_thread(get_bookmarks, db, user_id)
                    map_action = {
                        "type": "update_markers",
                        "bookmarks": bookmarks,
                    }
                return result, map_action

            elif tool_name == "update_bookmark":
                import asyncio
                result = await asyncio.to_thread(
                    update_bookmark,
                    db,
                    user_id,
                    None,
                    tool_args.get("bookmark_name"),
                    tool_args.get("new_name"),
                    tool_args.get("new_category"),
                )
                if "error" not in result:
                    bookmarks = await asyncio.to_thread(get_bookmarks, db, user_id)
                    map_action = {"type": "update_markers", "bookmarks": bookmarks}
                return result, map_action

            elif tool_name == "delete_bookmark":
                import asyncio
                success = await asyncio.to_thread(
                    delete_bookmark,
                    db,
                    user_id,
                    None,
                    tool_args.get("bookmark_name"),
                )
                result = {"success": success}
                if success:
                    bookmarks = await asyncio.to_thread(get_bookmarks, db, user_id)
                    map_action = {"type": "update_markers", "bookmarks": bookmarks}
                return result, map_action

            elif tool_name == "get_bookmarks":
                import asyncio
                bookmarks = await asyncio.to_thread(get_bookmarks, db, user_id)
                result = {"bookmarks": bookmarks, "count": len(bookmarks)}
                map_action = {"type": "update_markers", "bookmarks": bookmarks}
                return result, map_action

            elif tool_name == "get_location_insights":
                import asyncio
                insights = await asyncio.to_thread(get_location_insights, db, user_id)
                return {"insights": insights, "count": len(insights)}, None

            elif tool_name == "resolve_location":
                import asyncio
                name = tool_args.get("name", "")
                resolved = await asyncio.to_thread(resolve_named_location, db, user_id, name)
                if resolved:
                    return resolved, None
                return {"error": f"Could not resolve location '{name}'. Try saving it as a bookmark first."}, None

            else:
                return {"error": f"Unknown tool: {tool_name}"}, None

        except Exception as exc:
            return {"error": f"Tool '{tool_name}' failed: {str(exc)}"}, None

    # ------------------------------------------------------------------
    # Main agent loop
    # ------------------------------------------------------------------

    async def run(
        self,
        user_message: str,
        user_id: int,
        user_name: str,
        current_location: dict,
        session_messages: list,
        db,
    ) -> tuple[str, list]:
        """
        Run the agent for one user turn.

        Returns:
            (final_text_response, list_of_map_actions)
        """
        import asyncio

        # Load user context
        bookmarks = await asyncio.to_thread(get_bookmarks, db, user_id)
        insights = await asyncio.to_thread(get_location_insights, db, user_id)

        # Enrich current_location with a reverse-geocoded address if missing
        enriched_location = dict(current_location) if current_location else {}
        if enriched_location and not enriched_location.get("address"):
            lat = enriched_location.get("lat")
            lng = enriched_location.get("lng")
            if lat and lng:
                try:
                    rev = await reverse_geocode(lat, lng)
                    if "error" not in rev:
                        enriched_location["address"] = rev.get("formatted_address", "")
                except Exception:
                    pass

        system_prompt = self.build_system_prompt(
            user_name=user_name,
            current_location=enriched_location,
            bookmarks=bookmarks,
            insights=insights,
        )

        # Build message list: keep last 20 messages for context
        messages = list(session_messages[-20:])
        messages.append({"role": "user", "content": user_message})

        map_actions: list = []
        final_text = ""
        max_rounds = 5

        for _round in range(max_rounds):
            response = await self._call_openrouter(system=system_prompt, messages=messages)

            if "error" in response:
                final_text = f"I encountered an error: {response['error']}"
                break

            choice = response.get("choices", [{}])[0]
            message = choice.get("message", {})
            finish_reason = choice.get("finish_reason", "stop")

            # Append assistant message to conversation
            messages.append(message)

            tool_calls = message.get("tool_calls") or []

            if not tool_calls or finish_reason == "stop":
                # Final text response
                final_text = message.get("content") or ""
                break

            # Execute all tool calls in this round
            tool_results = []
            for tc in tool_calls:
                tc_id = tc.get("id", "")
                func = tc.get("function", {})
                tool_name = func.get("name", "")
                raw_args = func.get("arguments", "{}")
                try:
                    tool_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError:
                    tool_args = {}

                tool_result, map_action = await self.execute_tool(
                    tool_name=tool_name,
                    tool_args=tool_args,
                    user_id=user_id,
                    db=db,
                    current_location=current_location,
                )

                if map_action:
                    map_actions.append(map_action)

                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": json.dumps(tool_result),
                })

            messages.extend(tool_results)

        return final_text, map_actions

    # ------------------------------------------------------------------
    # OpenRouter HTTP call
    # ------------------------------------------------------------------

    async def _call_openrouter(self, system: str, messages: list) -> dict:
        if not self.api_key:
            return {"error": "OpenRouter API key not configured"}

        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}] + messages,
            "tools": self.tools,
            "tool_choice": "auto",
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mapmax.app",
            "X-Title": "MapMax",
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as exc:
            return {"error": f"OpenRouter HTTP error {exc.response.status_code}: {exc.response.text}"}
        except httpx.RequestError as exc:
            return {"error": f"OpenRouter request failed: {str(exc)}"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NEAR_ME_PHRASES = {
    "current location", "here", "my location", "nearby", "near me",
    "around me", "close to me", "current position", "where i am",
    "my current location", "my position", "near my location",
}


def _is_near_me(location_str: str) -> bool:
    return location_str.strip().lower() in _NEAR_ME_PHRASES


def _parse_latlng(s: str) -> tuple[Optional[float], Optional[float]]:
    """Parse 'lat,lng' string. Returns (None, None) if not a valid pair."""
    parts = s.split(",")
    if len(parts) != 2:
        return None, None
    try:
        return float(parts[0].strip()), float(parts[1].strip())
    except ValueError:
        return None, None

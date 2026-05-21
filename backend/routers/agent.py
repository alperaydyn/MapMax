"""
WebSocket agent endpoint.

Client connects to: ws://<host>/ws/agent?token=<jwt>

Message protocol (JSON):
  Client → Server: {"type": "message", "content": "...", "location": {"lat": float, "lng": float}}
  Server → Client:
    {"type": "thinking"}
    {"type": "response", "content": "...", "actions": [...]}
    {"type": "error", "message": "..."}
"""
import asyncio
import json
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from config import SECRET_KEY, ALGORITHM
from database.db import SessionLocal
from database.models import User, AgentMessage
from agent.map_agent import MapAgent

router = APIRouter()

# Single shared agent instance (stateless except for the model config)
_agent = MapAgent()

# Maximum conversation messages kept per connection
MAX_HISTORY = 20


@router.websocket("/ws/agent")
async def websocket_agent(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
):
    """
    WebSocket endpoint for the MapMax AI agent.
    Authentication is done via a JWT query parameter.
    """
    # --- Authenticate ---
    user_id, user_name = await _authenticate(websocket, token)
    if user_id is None:
        return  # connection already closed by _authenticate

    await websocket.accept()

    # Per-connection message history (for LLM context window)
    session_messages: list[dict] = []

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, {"type": "error", "message": "Invalid JSON."})
                continue

            msg_type = data.get("type", "message")

            if msg_type != "message":
                await _send(websocket, {"type": "error", "message": f"Unknown message type: {msg_type}"})
                continue

            content: str = (data.get("content") or "").strip()
            if not content:
                await _send(websocket, {"type": "error", "message": "Empty message."})
                continue

            location: dict = data.get("location") or {}

            # Signal that the agent is working
            await _send(websocket, {"type": "thinking"})

            # Persist user message
            await asyncio.to_thread(_save_message, user_id, "user", content)

            # Run the agent
            try:
                db = SessionLocal()
                try:
                    final_text, map_actions = await _agent.run(
                        user_message=content,
                        user_id=user_id,
                        user_name=user_name,
                        current_location=location,
                        session_messages=session_messages,
                        db=db,
                    )
                finally:
                    db.close()
            except Exception as exc:
                await _send(websocket, {"type": "error", "message": f"Agent error: {str(exc)}"})
                continue

            # Append to in-memory history (keep last MAX_HISTORY messages)
            session_messages.append({"role": "user", "content": content})
            session_messages.append({"role": "assistant", "content": final_text})
            if len(session_messages) > MAX_HISTORY:
                session_messages = session_messages[-MAX_HISTORY:]

            # Persist assistant message
            await asyncio.to_thread(_save_message, user_id, "assistant", final_text)

            # Send response back to client
            await _send(
                websocket,
                {
                    "type": "response",
                    "content": final_text,
                    "actions": map_actions,
                },
            )

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await _send(websocket, {"type": "error", "message": "Unexpected server error."})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _authenticate(
    websocket: WebSocket, token: Optional[str]
) -> tuple[Optional[int], str]:
    """
    Validate the JWT from the query string.
    Returns (user_id, user_name) on success, or (None, "") after rejecting the connection.
    """
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return None, ""

    try:
        from jose import jwt as _jwt
        payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise ValueError("Missing sub in token")
        user_id = int(user_id)
    except (JWTError, ValueError, Exception):
        await websocket.close(code=4001, reason="Invalid token")
        return None, ""

    # Fetch the user's name from DB
    user_name = "User"
    try:
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user is None:
                await websocket.close(code=4001, reason="User not found")
                return None, ""
            user_name = user.name
        finally:
            db.close()
    except Exception:
        pass

    return user_id, user_name


async def _send(websocket: WebSocket, payload: dict) -> None:
    """Send a JSON payload to the client, ignoring send errors on closed connections."""
    try:
        await websocket.send_text(json.dumps(payload))
    except Exception:
        pass


def _save_message(user_id: int, role: str, content: str) -> None:
    """Persist a conversation turn to the database (runs in a thread)."""
    db = SessionLocal()
    try:
        msg = AgentMessage(user_id=user_id, role=role, content=content)
        db.add(msg)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

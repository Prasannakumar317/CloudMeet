"""
FastAPI WebSocket router for CloudMeet real-time WebRTC signaling and meeting chat (Part 5 & Part 6).
Endpoint: /ws/meetings/{room_id}
"""
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.database import get_database
from app.dependencies.auth import verify_token, AuthenticatedUser
from app.services.signaling_manager import signaling_manager

logger = logging.getLogger("cloudmeet.routers.websocket")

router = APIRouter(tags=["WebSockets"])

# Maximum allowable signaling/chat message size (64KB)
MAX_MESSAGE_BYTES = 65536
MAX_CHAT_MESSAGE_LENGTH = 2000


@router.websocket("/ws/meetings/{room_id}")
async def websocket_signaling_endpoint(
    websocket: WebSocket,
    room_id: str,
    db=Depends(get_database),
):
    """
    Real-time WebRTC signaling & in-call communication channel.
    Handles:
    - Auth verification (first message)
    - WebRTC SDP offer/answer & ICE candidate exchange
    - Synchronized microphone, camera, and screen sharing states
    - In-room real-time chat messages
    """
    clean_room_id = room_id.strip().upper()
    await websocket.accept()

    # Step 1: Authentication Phase
    user: Optional[AuthenticatedUser] = None
    role: str = "participant"
    display_name: str = "Participant"

    try:
        # Wait up to 10 seconds for initial authentication message
        raw_auth = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)

        if len(raw_auth) > MAX_MESSAGE_BYTES:
            await websocket.close(code=4400, reason="Auth payload too large")
            return

        auth_payload = json.loads(raw_auth)
        if auth_payload.get("type") != "auth" or not auth_payload.get("token"):
            logger.warning("[WebSocket] First message was not a valid auth message")
            await websocket.send_json({"type": "error", "message": "Authentication required as first message"})
            await websocket.close(code=4401, reason="Invalid authentication payload")
            return

        token = auth_payload["token"].strip()
        user = verify_token(token)

    except asyncio.TimeoutError:
        logger.warning(f"[WebSocket] Auth timed out for room {clean_room_id}")
        await websocket.close(code=4408, reason="Authentication timeout")
        return
    except json.JSONDecodeError:
        logger.warning("[WebSocket] Malformed JSON in auth message")
        await websocket.close(code=4400, reason="Malformed JSON")
        return
    except Exception as err:
        logger.warning(f"[WebSocket] Token validation failed: {err}")
        try:
            await websocket.send_json({"type": "error", "message": "Authentication failed"})
            await websocket.close(code=4401, reason="Authentication failed")
        except Exception:
            pass
        return

    # Step 2: Validate Meeting & Participant state in MongoDB Atlas
    if db is None:
        db = get_database()
    if db is None:
        logger.error("[WebSocket] Database unavailable during signaling connection")
        await websocket.close(code=1011, reason="Database unavailable")
        return

    try:
        meeting = await db.meetings.find_one({"room_id": clean_room_id})
        if not meeting:
            logger.warning(f"[WebSocket] Meeting room {clean_room_id} does not exist")
            await websocket.send_json({"type": "error", "message": "We couldn't find that meeting."})
            await websocket.close(code=4404, reason="Meeting not found")
            return

        if meeting.get("status") == "ended":
            logger.warning(f"[WebSocket] Attempted signaling on ended meeting {clean_room_id}")
            await websocket.send_json({"type": "error", "message": "This meeting has already ended."})
            await websocket.close(code=4400, reason="Meeting ended")
            return

        # Derive authoritative role
        is_host = meeting.get("host_supabase_user_id") == user.id
        role = "host" if is_host else "participant"
        display_name = user.full_name or user.email or ("Host" if is_host else "Participant")

        # Verify or activate active participant record in MongoDB
        now = datetime.now(timezone.utc)
        await db.meeting_participants.update_one(
            {"room_id": clean_room_id, "supabase_user_id": user.id},
            {
                "$set": {
                    "is_active": True,
                    "role": role,
                    "full_name": display_name,
                    "email": user.email,
                    "joined_at": now,
                    "left_at": None,
                }
            },
            upsert=True,
        )

    except Exception as db_err:
        logger.error(f"[WebSocket] Error querying meeting database: {db_err}")
        await websocket.close(code=1011, reason="Database query failed")
        return

    # Step 3: Register in In-Memory Signaling Manager & Send Initial State
    initial_media_state = {
        "microphone_enabled": True,
        "camera_enabled": True,
        "screen_sharing": False,
    }
    await signaling_manager.connect(
        room_id=clean_room_id,
        user_id=user.id,
        websocket=websocket,
        full_name=display_name,
        role=role,
        media_state=initial_media_state,
    )

    # Send room_state to connecting participant (includes current media states of peers)
    existing_peers = signaling_manager.get_room_peers(clean_room_id, exclude_user_id=user.id)
    await websocket.send_json({
        "type": "room_state",
        "self": {
            "user_id": user.id,
            "full_name": display_name,
            "role": role,
            "media_state": initial_media_state,
        },
        "peers": existing_peers,
    })

    # Broadcast peer_joined to all other existing peers in the room
    await signaling_manager.broadcast_to_room(
        clean_room_id,
        {
            "type": "peer_joined",
            "peer": {
                "user_id": user.id,
                "full_name": display_name,
                "role": role,
                "media_state": initial_media_state,
            },
        },
        exclude_user_id=user.id,
    )

    logger.info(
        f"[WebSocket] Handshake complete for user {user.id} in room {clean_room_id}. Existing peers: {len(existing_peers)}"
    )

    # Step 4: Signaling and Communication Message Loop
    try:
        while True:
            raw_message = await websocket.receive_text()

            # Enforce size limits
            if len(raw_message) > MAX_MESSAGE_BYTES:
                logger.warning(f"[WebSocket] Dropping oversized message from {user.id}")
                await websocket.send_json({"type": "error", "message": "Message payload too large."})
                continue

            try:
                data = json.loads(raw_message)
            except json.JSONDecodeError:
                logger.warning(f"[WebSocket] Malformed message from {user.id}")
                await websocket.send_json({"type": "error", "message": "Invalid JSON payload."})
                continue

            msg_type = data.get("type")
            target = data.get("target")

            # Route WebRTC OFFER to specific target in the same room
            if msg_type == "offer":
                if not target or not isinstance(data.get("description"), dict):
                    continue
                await signaling_manager.send_to_user(
                    clean_room_id,
                    target,
                    {
                        "type": "offer",
                        "sender": user.id,
                        "description": data["description"],
                    },
                )

            # Route WebRTC ANSWER to specific target in the same room
            elif msg_type == "answer":
                if not target or not isinstance(data.get("description"), dict):
                    continue
                await signaling_manager.send_to_user(
                    clean_room_id,
                    target,
                    {
                        "type": "answer",
                        "sender": user.id,
                        "description": data["description"],
                    },
                )

            # Route ICE CANDIDATE to specific target in the same room
            elif msg_type == "ice_candidate":
                if not target or not isinstance(data.get("candidate"), dict):
                    continue
                await signaling_manager.send_to_user(
                    clean_room_id,
                    target,
                    {
                        "type": "ice_candidate",
                        "sender": user.id,
                        "candidate": data["candidate"],
                    },
                )

            # Broadcast camera / mic / screen share toggle state to room peers
            elif msg_type == "media_state":
                state_data = data.get("state") if isinstance(data.get("state"), dict) else data
                mic_enabled = bool(state_data.get("microphone_enabled", True))
                cam_enabled = bool(state_data.get("camera_enabled", True))
                scr_sharing = bool(state_data.get("screen_sharing", False))

                updated_state = {
                    "microphone_enabled": mic_enabled,
                    "camera_enabled": cam_enabled,
                    "screen_sharing": scr_sharing,
                }
                signaling_manager.update_media_state(clean_room_id, user.id, updated_state)

                await signaling_manager.broadcast_to_room(
                    clean_room_id,
                    {
                        "type": "media_state",
                        "user_id": user.id,
                        "user": {
                            "user_id": user.id,
                            "full_name": display_name,
                            "role": role,
                        },
                        "state": updated_state,
                        # Top-level properties for backward compatibility
                        "camera_enabled": cam_enabled,
                        "microphone_enabled": mic_enabled,
                        "screen_sharing": scr_sharing,
                    },
                    exclude_user_id=user.id,
                )

            # In-meeting Real-Time Chat (Part 6)
            elif msg_type == "chat_send":
                raw_text = data.get("message")
                if not isinstance(raw_text, str) or not raw_text.strip():
                    await websocket.send_json({"type": "error", "message": "Message cannot be empty."})
                    continue

                trimmed_text = raw_text.strip()
                if len(trimmed_text) > MAX_CHAT_MESSAGE_LENGTH:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Message is too long (maximum {MAX_CHAT_MESSAGE_LENGTH} characters).",
                    })
                    continue

                # Rate limiting check
                if not signaling_manager.check_chat_rate_limit(clean_room_id, user.id):
                    await websocket.send_json({
                        "type": "error",
                        "message": "Please slow down. You are sending messages too quickly.",
                    })
                    continue

                message_id = str(uuid.uuid4())
                sent_at = datetime.now(timezone.utc).isoformat()

                # Broadcast chat message to all active participants in the room (including sender)
                await signaling_manager.broadcast_to_room(
                    clean_room_id,
                    {
                        "type": "chat_message",
                        "message_id": message_id,
                        "user": {
                            "user_id": user.id,
                            "full_name": display_name,
                        },
                        "message": trimmed_text,
                        "sent_at": sent_at,
                    },
                    exclude_user_id=None,
                )

            # Liveness ping
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                logger.debug(f"[WebSocket] Ignored unhandled message type: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"[WebSocket] Disconnected: user {user.id} from room {clean_room_id}")
    except Exception as err:
        logger.warning(f"[WebSocket] Exception in message loop for {user.id}: {err}")
    finally:
        # Step 5: Clean Up & Broadcast peer_left
        await signaling_manager.disconnect(clean_room_id, user.id)
        await signaling_manager.broadcast_to_room(
            clean_room_id,
            {
                "type": "peer_left",
                "user_id": user.id,
            },
            exclude_user_id=user.id,
        )

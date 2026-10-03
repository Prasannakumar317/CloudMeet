"""
In-memory WebRTC Signaling Connection Manager for CloudMeet (Part 5 & Part 6).

Maintains live WebSocket connections per meeting room in memory.
Tracks media states (mic, camera, screen share) and supports real-time chat broadcast.
Does not store WebSocket objects or transient chat messages in MongoDB.
"""
import time
import logging
from typing import Dict, Any, List, Optional
from fastapi import WebSocket

logger = logging.getLogger("cloudmeet.signaling_manager")


class ParticipantConnection:
    """Represents an active signaling connection for an authenticated user."""
    def __init__(
        self,
        websocket: WebSocket,
        user_id: str,
        full_name: str,
        role: str,
        media_state: Optional[Dict[str, bool]] = None,
    ):
        self.websocket = websocket
        self.user_id = user_id
        self.full_name = full_name
        self.role = role
        self.media_state = media_state or {
            "microphone_enabled": True,
            "camera_enabled": True,
            "screen_sharing": False,
        }
        # In-process chat rate limit tracking
        self.last_chat_time: float = 0.0
        self.chat_window_start: float = time.time()
        self.chat_window_count: int = 0


class SignalingManager:
    """
    Manages active room signaling sessions.
    Structure: rooms[room_id][user_id] = ParticipantConnection
    """
    def __init__(self):
        self.rooms: Dict[str, Dict[str, ParticipantConnection]] = {}

    def room_exists(self, room_id: str) -> bool:
        """Check if an active room exists with live signaling connections."""
        return room_id in self.rooms and len(self.rooms[room_id]) > 0

    def get_room_peer_count(self, room_id: str) -> int:
        """Get count of active signaling participants in the room."""
        return len(self.rooms.get(room_id, {}))

    async def connect(
        self,
        room_id: str,
        user_id: str,
        websocket: WebSocket,
        full_name: str,
        role: str,
        media_state: Optional[Dict[str, bool]] = None,
    ) -> None:
        """
        Register authenticated WebSocket connection.
        Enforces at most one active connection per user per room by closing older duplicates.
        """
        if room_id not in self.rooms:
            self.rooms[room_id] = {}

        # If user is already connected in this room (e.g. duplicate tab/refresh), close older connection safely
        if user_id in self.rooms[room_id]:
            old_conn = self.rooms[room_id][user_id]
            logger.info(
                f"[SignalingManager] Closing prior connection for user {user_id} in room {room_id}"
            )
            try:
                await old_conn.websocket.close(code=1000, reason="Replaced by new connection")
            except Exception:
                pass

        self.rooms[room_id][user_id] = ParticipantConnection(
            websocket=websocket,
            user_id=user_id,
            full_name=full_name,
            role=role,
            media_state=media_state,
        )
        logger.info(
            f"[SignalingManager] User {user_id} ({role}) registered in room {room_id}. Total active: {len(self.rooms[room_id])}"
        )

    async def disconnect(self, room_id: str, user_id: str) -> Optional[ParticipantConnection]:
        """Remove a participant connection when their WebSocket disconnects."""
        if room_id in self.rooms and user_id in self.rooms[room_id]:
            conn = self.rooms[room_id].pop(user_id)
            logger.info(
                f"[SignalingManager] User {user_id} removed from room {room_id}. Remaining: {len(self.rooms[room_id])}"
            )
            if not self.rooms[room_id]:
                del self.rooms[room_id]
            return conn
        return None

    def update_media_state(
        self, room_id: str, user_id: str, media_state: Dict[str, bool]
    ) -> Optional[Dict[str, bool]]:
        """Update and return the participant's media state in memory."""
        if room_id in self.rooms and user_id in self.rooms[room_id]:
            conn = self.rooms[room_id][user_id]
            conn.media_state.update(media_state)
            return conn.media_state
        return None

    def get_user_media_state(self, room_id: str, user_id: str) -> Optional[Dict[str, bool]]:
        """Retrieve media state for a participant."""
        if room_id in self.rooms and user_id in self.rooms[room_id]:
            return self.rooms[room_id][user_id].media_state
        return None

    def get_room_peers(
        self, room_id: str, exclude_user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return list of safe peer representations currently connected to this room."""
        if room_id not in self.rooms:
            return []
        peers = []
        for uid, conn in self.rooms[room_id].items():
            if exclude_user_id and uid == exclude_user_id:
                continue
            peers.append({
                "user_id": conn.user_id,
                "full_name": conn.full_name,
                "role": conn.role,
                "media_state": dict(conn.media_state),
            })
        return peers

    def check_chat_rate_limit(self, room_id: str, user_id: str) -> bool:
        """
        Lightweight in-process rate limiter:
        Allows at most 5 messages per 2-second rolling window and minimum 150ms delay.
        Returns True if message is allowed, False if rate limited.
        """
        if room_id not in self.rooms or user_id not in self.rooms[room_id]:
            return False

        conn = self.rooms[room_id][user_id]
        now = time.time()

        # Minimum delay between messages (150ms)
        if now - conn.last_chat_time < 0.15:
            return False

        # Reset burst counter every 2 seconds
        if now - conn.chat_window_start > 2.0:
            conn.chat_window_start = now
            conn.chat_window_count = 0

        if conn.chat_window_count >= 5:
            return False

        conn.chat_window_count += 1
        conn.last_chat_time = now
        return True

    async def send_to_user(
        self, room_id: str, target_user_id: str, message: Dict[str, Any]
    ) -> bool:
        """Forward a signaling message (offer, answer, ice_candidate) to a specific target peer."""
        if room_id not in self.rooms or target_user_id not in self.rooms[room_id]:
            logger.warning(
                f"[SignalingManager] Cannot deliver message: target {target_user_id} not in room {room_id}"
            )
            return False

        conn = self.rooms[room_id][target_user_id]
        try:
            await conn.websocket.send_json(message)
            return True
        except Exception as err:
            logger.error(
                f"[SignalingManager] Failed to send message to user {target_user_id} in {room_id}: {err}"
            )
            return False

    async def broadcast_to_room(
        self,
        room_id: str,
        message: Dict[str, Any],
        exclude_user_id: Optional[str] = None,
    ) -> None:
        """Broadcast a message to active participants in the room."""
        if room_id not in self.rooms:
            return

        dead_users = []
        for uid, conn in self.rooms[room_id].items():
            if exclude_user_id and uid == exclude_user_id:
                continue
            try:
                await conn.websocket.send_json(message)
            except Exception as err:
                logger.warning(f"[SignalingManager] Broadcast failed for {uid} in {room_id}: {err}")
                dead_users.append(uid)

        for dead_uid in dead_users:
            await self.disconnect(room_id, dead_uid)

    async def broadcast_and_close_room(
        self, room_id: str, message_text: str = "The host ended this meeting."
    ) -> None:
        """Notify all participants that the room has ended and gracefully close all WebSockets."""
        if room_id not in self.rooms:
            return

        connections = list(self.rooms[room_id].values())
        del self.rooms[room_id]

        for conn in connections:
            try:
                await conn.websocket.send_json({
                    "type": "room_ended",
                    "message": message_text,
                })
                await conn.websocket.close(code=1000, reason=message_text)
            except Exception:
                pass
        logger.info(f"[SignalingManager] Room {room_id} closed and all connections terminated.")


# Global singleton instance for the current backend process
signaling_manager = SignalingManager()

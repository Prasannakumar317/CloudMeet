"""
Signaling and Real-Time message schemas for CloudMeet WebRTC & WebSocket layer (Part 5 & Part 6).
"""
from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field


class SignalingAuthMessage(BaseModel):
    type: Literal["auth"]
    token: str


class MediaStatePayload(BaseModel):
    microphone_enabled: bool = True
    camera_enabled: bool = True
    screen_sharing: bool = False


class PeerInfo(BaseModel):
    user_id: str
    full_name: Optional[str] = "Participant"
    role: str = "participant"
    media_state: Optional[MediaStatePayload] = None


class RoomStateMessage(BaseModel):
    type: Literal["room_state"] = "room_state"
    self: PeerInfo
    peers: List[PeerInfo]


class PeerJoinedMessage(BaseModel):
    type: Literal["peer_joined"] = "peer_joined"
    peer: PeerInfo


class PeerLeftMessage(BaseModel):
    type: Literal["peer_left"] = "peer_left"
    user_id: str


class SdpDescription(BaseModel):
    type: Literal["offer", "answer"]
    sdp: str


class OfferSignalingMessage(BaseModel):
    type: Literal["offer"]
    target: str
    description: Dict[str, Any]


class AnswerSignalingMessage(BaseModel):
    type: Literal["answer"]
    target: str
    description: Dict[str, Any]


class IceCandidateSignalingMessage(BaseModel):
    type: Literal["ice_candidate"]
    target: str
    candidate: Dict[str, Any]


class MediaStateClientMessage(BaseModel):
    type: Literal["media_state"] = "media_state"
    state: Optional[MediaStatePayload] = None
    microphone_enabled: Optional[bool] = None
    camera_enabled: Optional[bool] = None
    screen_sharing: Optional[bool] = None


class MediaStateBroadcastMessage(BaseModel):
    type: Literal["media_state"] = "media_state"
    user_id: str
    user: PeerInfo
    state: MediaStatePayload


class ChatSendMessage(BaseModel):
    type: Literal["chat_send"]
    message: str = Field(..., min_length=1, max_length=2000)


class ChatUser(BaseModel):
    user_id: str
    full_name: str


class ChatBroadcastMessage(BaseModel):
    type: Literal["chat_message"] = "chat_message"
    message_id: str
    user: ChatUser
    message: str
    sent_at: str

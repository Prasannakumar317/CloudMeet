from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

class CreateMeetingRequest(BaseModel):
    title: Optional[str] = Field(
        default="CloudMeet Meeting",
        max_length=120,
        description="Optional title for the meeting"
    )

class ParticipantResponse(BaseModel):
    id: str = Field(..., description="Participant's Supabase User ID")
    full_name: Optional[str] = Field(None, description="Display name of the participant")
    email: Optional[str] = Field(None, description="Email address if available")
    role: str = Field(default="participant", description="Role: 'host' or 'participant'")
    is_active: bool = Field(default=True, description="Whether currently in the meeting")
    joined_at: Optional[datetime] = Field(None, description="When participant joined (UTC)")

class MeetingResponse(BaseModel):
    room_id: str = Field(..., description="Unique human-readable room code")
    title: str = Field(..., description="Meeting title")
    status: str = Field(..., description="Meeting status: 'active' or 'ended'")
    host_supabase_user_id: Optional[str] = Field(None, description="Host user ID")
    role: Optional[str] = Field(None, description="Current user's role in this meeting")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp (UTC)")
    started_at: Optional[datetime] = Field(None, description="Meeting start timestamp (UTC)")
    ended_at: Optional[datetime] = Field(None, description="Meeting end timestamp (UTC)")
    participant_count: int = Field(default=1, description="Active participant count")

class JoinMeetingResponse(BaseModel):
    room_id: str
    title: str
    status: str
    participant: ParticipantResponse
    participant_count: int

class LeaveMeetingResponse(BaseModel):
    message: str = Field(default="You left the meeting")
    room_id: str

class EndMeetingResponse(BaseModel):
    message: str = Field(default="Meeting ended")
    room_id: str
    status: str = Field(default="ended")

class ParticipantListResponse(BaseModel):
    room_id: str
    participants: List[ParticipantResponse]
    count: int

class MyMeetingResponse(BaseModel):
    room_id: str
    title: str
    status: str
    role: str
    created_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

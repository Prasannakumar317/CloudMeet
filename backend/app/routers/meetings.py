import logging
import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pymongo.asynchronous.database import AsyncDatabase
from app.dependencies.auth import get_current_user, AuthenticatedUser
from app.database import get_database
from app.schemas.meeting import (
    CreateMeetingRequest,
    MeetingResponse,
    JoinMeetingResponse,
    LeaveMeetingResponse,
    EndMeetingResponse,
    ParticipantListResponse,
    MyMeetingResponse,
)
from app.services import meeting_service

logger = logging.getLogger("cloudmeet.routers.meetings")

router = APIRouter(prefix="/meetings", tags=["Meetings"])


def require_db(db: Optional[AsyncDatabase] = Depends(get_database)) -> AsyncDatabase:
    if db is None:
        if db_manager.database is None:
            from app.database import MockMongoDatabase
            db_manager.database = MockMongoDatabase()
            db_manager._is_in_memory = True
        return db_manager.database
    return db


@router.post(
    "",
    response_model=MeetingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new meeting room",
    description="Generates a unique room ID, creates the meeting, and registers the authenticated user as the host.",
)
async def create_meeting_endpoint(
    payload: Optional[CreateMeetingRequest] = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncDatabase = Depends(require_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> MeetingResponse:
    t_start = time.perf_counter()
    logger.info("CREATE_MEETING request received")
    logger.info("CREATE_MEETING authentication complete")
    title = payload.title if payload else None
    result = await meeting_service.create_meeting(
        db=db,
        host_user=current_user,
        title=title,
        idempotency_key=idempotency_key,
    )
    elapsed_ms = int((time.perf_counter() - t_start) * 1000)
    logger.info(f"CREATE_MEETING completed in {elapsed_ms}ms")
    return result


# ==============================================================================
# PART 5 WEBRTC & WEBSOCKET BOUNDARY NOTICE:
# The WebSocket signaling endpoint: /ws/meetings/{room_id}
# is reserved for PART 5 (SDP offer/answer, ICE candidates, and real-time media).
# It is intentionally NOT implemented in Part 4.
# ==============================================================================



@router.get(
    "/my",
    response_model=List[MyMeetingResponse],
    summary="Get user's recent meetings",
    description="Retrieve a list of recent meetings where the user participated or acted as host.",
)
async def get_my_meetings_endpoint(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncDatabase = Depends(require_db),
) -> List[MyMeetingResponse]:
    return await meeting_service.get_my_recent_meetings(
        db=db,
        current_user=current_user,
        limit=20,
    )


@router.get(
    "/{room_id}",
    response_model=MeetingResponse,
    summary="Get meeting details",
    description="Verify whether a meeting room exists and retrieve safe metadata including active participant count.",
)
async def get_meeting_endpoint(
    room_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncDatabase = Depends(require_db),
) -> MeetingResponse:
    return await meeting_service.get_meeting_details(
        db=db,
        room_id=room_id,
        current_user=current_user,
    )


@router.post(
    "/{room_id}/join",
    response_model=JoinMeetingResponse,
    summary="Join a meeting room",
    description="Validate active status and join or reactivate the authenticated user in the meeting.",
)
async def join_meeting_endpoint(
    room_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncDatabase = Depends(require_db),
) -> JoinMeetingResponse:
    return await meeting_service.join_meeting(
        db=db,
        room_id=room_id,
        current_user=current_user,
    )


@router.post(
    "/{room_id}/leave",
    response_model=LeaveMeetingResponse,
    summary="Leave a meeting room",
    description="Mark the authenticated user as inactive in the specified meeting.",
)
async def leave_meeting_endpoint(
    room_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncDatabase = Depends(require_db),
) -> LeaveMeetingResponse:
    return await meeting_service.leave_meeting(
        db=db,
        room_id=room_id,
        current_user=current_user,
    )


@router.post(
    "/{room_id}/end",
    response_model=EndMeetingResponse,
    summary="End meeting (Host only)",
    description="Allows only the verified meeting host to end the session and deactivate all participants.",
)
async def end_meeting_endpoint(
    room_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncDatabase = Depends(require_db),
) -> EndMeetingResponse:
    return await meeting_service.end_meeting(
        db=db,
        room_id=room_id,
        current_user=current_user,
    )


@router.get(
    "/{room_id}/participants",
    response_model=ParticipantListResponse,
    summary="List active participants",
    description="Retrieve all participants currently active in the meeting room.",
)
async def get_participants_endpoint(
    room_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncDatabase = Depends(require_db),
) -> ParticipantListResponse:
    # Requires authentication and room participation authorization
    return await meeting_service.get_active_participants(
        db=db,
        room_id=room_id,
        current_user=current_user,
    )

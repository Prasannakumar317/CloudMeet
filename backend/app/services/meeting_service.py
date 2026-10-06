import secrets
import string
import logging
from datetime import datetime, timezone
from typing import List, Optional
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError
from fastapi import HTTPException, status
from app.dependencies.auth import AuthenticatedUser
from app.schemas.meeting import (
    MeetingResponse,
    JoinMeetingResponse,
    LeaveMeetingResponse,
    EndMeetingResponse,
    ParticipantResponse,
    ParticipantListResponse,
    MyMeetingResponse,
)

logger = logging.getLogger("cloudmeet.meeting_service")

# Meeting status constants
STATUS_ACTIVE = "active"
STATUS_ENDED = "ended"

# Participant role constants
ROLE_HOST = "host"
ROLE_PARTICIPANT = "participant"

# Characters for readable, clean room IDs (excluding easily confused 0, O, 1, I, L)
ROOM_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def validate_room_id_format(room_id: str) -> str:
    """
    Validate room ID format and return cleaned uppercase string.
    Ensures safe, bounded alphanumeric room codes without arbitrary injections.
    """
    if not room_id or not isinstance(room_id, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room ID is required.",
        )
    cleaned = room_id.strip().upper().replace("-", "")
    if len(cleaned) < 4 or len(cleaned) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room ID must be between 4 and 20 characters.",
        )
    if not cleaned.isalnum():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room ID must contain only alphanumeric characters.",
        )
    return cleaned


def generate_room_id(length: int = 8) -> str:
    """
    Generate a clean, secure, human-readable meeting room ID.
    Example format: AB7K9P2Q. Does not encode any user information.
    """
    return "".join(secrets.choice(ROOM_ID_ALPHABET) for _ in range(length))


async def create_meeting(
    db: AsyncDatabase,
    host_user: AuthenticatedUser,
    title: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> MeetingResponse:
    """
    Create a new meeting with a unique room ID and register host as an active participant.
    Derives host identity strictly from verified Supabase AuthenticatedUser.
    Supports safe idempotency keys to prevent duplicate rooms on retries.
    """
    logger.info("CREATE_MEETING database operation started")
    clean_title = (title or "").strip()
    if not clean_title:
        clean_title = "CloudMeet Meeting"

    # Idempotency check: if client sent an idempotency key, reuse already-created meeting if found
    if idempotency_key and str(idempotency_key).strip():
        clean_idempotency_key = str(idempotency_key).strip()
        existing_meeting = await db.meetings.find_one({
            "idempotency_key": clean_idempotency_key,
            "host_supabase_user_id": host_user.id,
            "status": STATUS_ACTIVE,
        })
        if existing_meeting:
            logger.info(
                f"[MeetingService] Idempotency match for key '{clean_idempotency_key}', returning room '{existing_meeting['room_id']}'"
            )
            logger.info("CREATE_MEETING database operation completed")
            return MeetingResponse(
                room_id=existing_meeting["room_id"],
                title=existing_meeting.get("title", clean_title),
                status=existing_meeting.get("status", STATUS_ACTIVE),
                host_supabase_user_id=host_user.id,
                role=ROLE_HOST,
                created_at=existing_meeting.get("created_at"),
                started_at=existing_meeting.get("started_at"),
                ended_at=existing_meeting.get("ended_at"),
                participant_count=1,
            )

    now = datetime.now(timezone.utc)
    room_id: Optional[str] = None

    # Attempt to find and insert an unused room ID with collision retry
    for attempt in range(5):
        candidate_room_id = generate_room_id(8)
        existing = await db.meetings.find_one({"room_id": candidate_room_id})
        if existing:
            continue

        # Meeting Document
        meeting_doc = {
            "room_id": candidate_room_id,
            "title": clean_title,
            "host_supabase_user_id": host_user.id,
            "status": STATUS_ACTIVE,
            "created_at": now,
            "started_at": now,
            "ended_at": None,
        }
        if idempotency_key and str(idempotency_key).strip():
            meeting_doc["idempotency_key"] = str(idempotency_key).strip()

        try:
            await db.meetings.insert_one(meeting_doc)
            room_id = candidate_room_id
            break
        except DuplicateKeyError:
            logger.warning(
                f"[MeetingService] Collision detected for room_id {candidate_room_id}, retrying..."
            )
            continue
    else:
        logger.error("[MeetingService] Failed to generate a unique room ID after 5 attempts")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate a unique room ID. Please try again.",
        )

    logger.info(f"[MeetingService] Created meeting '{room_id}' hosted by {host_user.id}")

    # Register Host in meeting_participants
    display_name = host_user.full_name or host_user.email or "Host"
    host_participant = {
        "room_id": room_id,
        "supabase_user_id": host_user.id,
        "full_name": display_name,
        "email": host_user.email,
        "role": ROLE_HOST,
        "joined_at": now,
        "left_at": None,
        "is_active": True,
    }

    try:
        await db.meeting_participants.insert_one(host_participant)
    except DuplicateKeyError:
        # Host record already exists
        await db.meeting_participants.update_one(
            {"room_id": room_id, "supabase_user_id": host_user.id},
            {
                "$set": {
                    "is_active": True,
                    "role": ROLE_HOST,
                    "joined_at": now,
                    "left_at": None,
                    "full_name": display_name,
                    "email": host_user.email,
                }
            },
            upsert=True,
        )
    except Exception as part_err:
        logger.error(f"[MeetingService] Failed to register host participant, rolling back meeting '{room_id}': {part_err}")
        try:
            await db.meetings.delete_one({"room_id": room_id})
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize meeting host. Please try again.",
        )

    logger.info("CREATE_MEETING database operation completed")

    return MeetingResponse(
        room_id=room_id,
        title=clean_title,
        status=STATUS_ACTIVE,
        host_supabase_user_id=host_user.id,
        role=ROLE_HOST,
        created_at=now,
        started_at=now,
        ended_at=None,
        participant_count=1,
    )


async def get_meeting_details(
    db: AsyncDatabase,
    room_id: str,
    current_user: AuthenticatedUser,
) -> MeetingResponse:
    """Retrieve safe meeting information and active participant count."""
    clean_room_id = validate_room_id_format(room_id)
    meeting = await db.meetings.find_one({"room_id": clean_room_id})

    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We couldn't find that meeting. Check the meeting ID and try again.",
        )

    # Active participants count
    participant_count = await db.meeting_participants.count_documents(
        {"room_id": clean_room_id, "is_active": True}
    )

    # Determine user's role
    role = None
    if meeting.get("host_supabase_user_id") == current_user.id:
        role = ROLE_HOST
    else:
        part = await db.meeting_participants.find_one(
            {"room_id": clean_room_id, "supabase_user_id": current_user.id, "is_active": True}
        )
        if part:
            role = part.get("role", ROLE_PARTICIPANT)

    return MeetingResponse(
        room_id=meeting["room_id"],
        title=meeting.get("title", "CloudMeet Meeting"),
        status=meeting.get("status", STATUS_ACTIVE),
        host_supabase_user_id=meeting.get("host_supabase_user_id") if role == ROLE_HOST else None,
        role=role,
        created_at=meeting.get("created_at"),
        started_at=meeting.get("started_at"),
        ended_at=meeting.get("ended_at"),
        participant_count=participant_count,
    )


async def join_meeting(
    db: AsyncDatabase,
    room_id: str,
    current_user: AuthenticatedUser,
) -> JoinMeetingResponse:
    """
    Join an active meeting or reactivate an existing participation record.
    Prevents duplicate active records for the same user in the same room.
    """
    clean_room_id = validate_room_id_format(room_id)
    meeting = await db.meetings.find_one({"room_id": clean_room_id})

    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We couldn't find that meeting. Check the meeting ID and try again.",
        )

    if meeting.get("status") == STATUS_ENDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This meeting has already ended.",
        )

    now = datetime.now(timezone.utc)
    display_name = current_user.full_name or current_user.email or "Participant"
    is_host = meeting.get("host_supabase_user_id") == current_user.id
    role = ROLE_HOST if is_host else ROLE_PARTICIPANT

    # 1. Determine whether the user is already actively joined
    active_record = await db.meeting_participants.find_one(
        {"room_id": clean_room_id, "supabase_user_id": current_user.id, "is_active": True}
    )

    if active_record:
        # Already active, return existing record without duplicate insertion
        participant_count = await db.meeting_participants.count_documents(
            {"room_id": clean_room_id, "is_active": True}
        )
        return JoinMeetingResponse(
            room_id=clean_room_id,
            title=meeting.get("title", "CloudMeet Meeting"),
            status=meeting.get("status", STATUS_ACTIVE),
            participant=ParticipantResponse(
                id=active_record["supabase_user_id"],
                full_name=active_record.get("full_name"),
                email=active_record.get("email"),
                role=active_record.get("role", role),
                is_active=True,
                joined_at=active_record.get("joined_at"),
            ),
            participant_count=participant_count,
        )

    # 2. Check if user previously left and is rejoining
    inactive_record = await db.meeting_participants.find_one(
        {"room_id": clean_room_id, "supabase_user_id": current_user.id}
    )

    try:
        if inactive_record:
            # Reactivate existing record atomically
            await db.meeting_participants.update_one(
                {"_id": inactive_record["_id"]},
                {
                    "$set": {
                        "is_active": True,
                        "joined_at": now,
                        "left_at": None,
                        "role": role,
                        "full_name": display_name,
                        "email": current_user.email,
                    }
                },
            )
            joined_at = now
        else:
            # Create new participant record
            new_record = {
                "room_id": clean_room_id,
                "supabase_user_id": current_user.id,
                "full_name": display_name,
                "email": current_user.email,
                "role": role,
                "joined_at": now,
                "left_at": None,
                "is_active": True,
            }
            await db.meeting_participants.insert_one(new_record)
            joined_at = now
    except DuplicateKeyError:
        # A concurrent request already activated this user
        existing_active = await db.meeting_participants.find_one(
            {"room_id": clean_room_id, "supabase_user_id": current_user.id, "is_active": True}
        )
        joined_at = existing_active.get("joined_at") if existing_active else now

    participant_count = await db.meeting_participants.count_documents(
        {"room_id": clean_room_id, "is_active": True}
    )

    return JoinMeetingResponse(
        room_id=clean_room_id,
        title=meeting.get("title", "CloudMeet Meeting"),
        status=meeting.get("status", STATUS_ACTIVE),
        participant=ParticipantResponse(
            id=current_user.id,
            full_name=display_name,
            email=current_user.email,
            role=role,
            is_active=True,
            joined_at=joined_at,
        ),
        participant_count=participant_count,
    )


async def leave_meeting(
    db: AsyncDatabase,
    room_id: str,
    current_user: AuthenticatedUser,
) -> LeaveMeetingResponse:
    """
    Mark the authenticated user as inactive in the specified meeting.
    Users can only mark themselves as inactive.
    """
    clean_room_id = validate_room_id_format(room_id)
    meeting = await db.meetings.find_one({"room_id": clean_room_id})

    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We couldn't find that meeting. Check the meeting ID and try again.",
        )

    now = datetime.now(timezone.utc)

    # Deactivate active participant records for this user in this room
    result = await db.meeting_participants.update_many(
        {"room_id": clean_room_id, "supabase_user_id": current_user.id, "is_active": True},
        {"$set": {"is_active": False, "left_at": now}},
    )

    logger.info(
        f"[MeetingService] User {current_user.id} left meeting {clean_room_id} (modified {result.modified_count} records)"
    )

    return LeaveMeetingResponse(
        message="You left the meeting",
        room_id=clean_room_id,
    )


async def end_meeting(
    db: AsyncDatabase,
    room_id: str,
    current_user: AuthenticatedUser,
) -> EndMeetingResponse:
    """
    Allow host to end the meeting and deactivate all active participants.
    Only the verified host can end the meeting (checked against host_supabase_user_id).
    """
    clean_room_id = validate_room_id_format(room_id)
    meeting = await db.meetings.find_one({"room_id": clean_room_id})

    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We couldn't find that meeting. Check the meeting ID and try again.",
        )

    # Verify that the authenticated user is the host
    if meeting.get("host_supabase_user_id") != current_user.id:
        logger.warning(
            f"[MeetingService] Unauthorized end attempt by {current_user.id} on meeting {clean_room_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the meeting host can end this meeting.",
        )

    now = datetime.now(timezone.utc)

    # Mark meeting status as ended
    await db.meetings.update_one(
        {"room_id": clean_room_id},
        {"$set": {"status": STATUS_ENDED, "ended_at": now}},
    )

    # Mark all active participants as inactive
    await db.meeting_participants.update_many(
        {"room_id": clean_room_id, "is_active": True},
        {"$set": {"is_active": False, "left_at": now}},
    )

    # Notify connected WebSockets that room has ended and close them
    try:
        from app.services.signaling_manager import signaling_manager
        await signaling_manager.broadcast_and_close_room(clean_room_id, "The host ended this meeting.")
    except Exception as sig_err:
        logger.warning(f"[MeetingService] Failed to broadcast room_ended to WebSockets: {sig_err}")

    logger.info(f"[MeetingService] Host {current_user.id} ended meeting {clean_room_id}")

    return EndMeetingResponse(
        message="Meeting ended",
        room_id=clean_room_id,
        status=STATUS_ENDED,
    )


async def get_active_participants(
    db: AsyncDatabase,
    room_id: str,
    current_user: Optional[AuthenticatedUser] = None,
) -> ParticipantListResponse:
    """Retrieve list of currently active participants in the meeting."""
    clean_room_id = validate_room_id_format(room_id)
    meeting = await db.meetings.find_one({"room_id": clean_room_id})

    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We couldn't find that meeting. Check the meeting ID and try again.",
        )

    # Room authorization: only host or active/registered participants can view participant lists
    if current_user:
        is_host = meeting.get("host_supabase_user_id") == current_user.id
        if not is_host:
            has_record = await db.meeting_participants.find_one(
                {"room_id": clean_room_id, "supabase_user_id": current_user.id}
            )
            if not has_record:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You must be a participant of this meeting to view its participant list.",
                )

    cursor = db.meeting_participants.find(
        {"room_id": clean_room_id, "is_active": True}
    ).sort("joined_at", 1)

    participants = []
    async for doc in cursor:
        participants.append(
            ParticipantResponse(
                id=doc["supabase_user_id"],
                full_name=doc.get("full_name"),
                email=doc.get("email"),
                role=doc.get("role", ROLE_PARTICIPANT),
                is_active=True,
                joined_at=doc.get("joined_at"),
            )
        )

    return ParticipantListResponse(
        room_id=clean_room_id,
        participants=participants,
        count=len(participants),
    )


async def get_my_recent_meetings(
    db: AsyncDatabase,
    current_user: AuthenticatedUser,
    limit: int = 20,
) -> List[MyMeetingResponse]:
    """Retrieve recent meetings where user was host or participant, newest first."""
    # Find room IDs where the user participated
    p_cursor = db.meeting_participants.find(
        {"supabase_user_id": current_user.id}
    ).sort("joined_at", -1).limit(limit)

    participated_rooms = set()
    role_by_room = {}
    async for p in p_cursor:
        r_id = p.get("room_id")
        if r_id:
            participated_rooms.add(r_id)
            if r_id not in role_by_room:
                role_by_room[r_id] = p.get("role", ROLE_PARTICIPANT)

    # Find room IDs where user was host
    h_cursor = db.meetings.find(
        {"host_supabase_user_id": current_user.id}
    ).sort("created_at", -1).limit(limit)

    async for h in h_cursor:
        r_id = h.get("room_id")
        if r_id:
            participated_rooms.add(r_id)
            role_by_room[r_id] = ROLE_HOST

    if not participated_rooms:
        return []

    # Fetch meeting documents sorted newest first
    meetings_cursor = db.meetings.find(
        {"room_id": {"$in": list(participated_rooms)}}
    ).sort("created_at", -1).limit(limit)

    result = []
    async for m in meetings_cursor:
        r_id = m.get("room_id")
        # Ensure role is accurately identified as host if user is the meeting's host
        user_role = ROLE_HOST if m.get("host_supabase_user_id") == current_user.id else role_by_room.get(r_id, ROLE_PARTICIPANT)

        result.append(
            MyMeetingResponse(
                room_id=r_id,
                title=m.get("title", "CloudMeet Meeting"),
                status=m.get("status", STATUS_ACTIVE),
                role=user_role,
                created_at=m.get("created_at"),
                ended_at=m.get("ended_at"),
            )
        )

    return result

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from app.dependencies.auth import get_current_user, AuthenticatedUser
from typing import Optional
from pymongo.asynchronous.database import AsyncDatabase
from app.schemas.user import UserProfileResponse, UpdateUserProfileRequest
from app.database import get_database

logger = logging.getLogger("cloudmeet.users")

router = APIRouter(prefix="/users", tags=["Users"])

@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user profile",
    description="Retrieve the authenticated user profile from MongoDB Atlas, creating it if it does not exist."
)
async def get_my_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Optional[AsyncDatabase] = Depends(get_database),
) -> UserProfileResponse:
    if db is None:
        logger.error("[Users] MongoDB database is not available for user profile storage")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is currently unavailable",
        )

    try:
        # Check if user profile already exists
        existing_profile = await db.users.find_one({"supabase_user_id": current_user.id})

        if existing_profile:
            # Profile exists: update if metadata changed
            update_data = {}
            if current_user.email and existing_profile.get("email") != current_user.email:
                update_data["email"] = current_user.email
            if current_user.full_name and existing_profile.get("full_name") != current_user.full_name:
                update_data["full_name"] = current_user.full_name

            if update_data:
                update_data["updated_at"] = datetime.now(timezone.utc)
                await db.users.update_one(
                    {"supabase_user_id": current_user.id},
                    {"$set": update_data},
                )
                existing_profile.update(update_data)

            return UserProfileResponse(
                id=existing_profile["supabase_user_id"],
                email=existing_profile.get("email"),
                full_name=existing_profile.get("full_name"),
                created_at=existing_profile.get("created_at"),
                updated_at=existing_profile.get("updated_at"),
            )

        # Profile does not exist: create it with UTC timestamps
        now = datetime.now(timezone.utc)
        new_profile = {
            "supabase_user_id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "created_at": now,
            "updated_at": now,
        }

        await db.users.insert_one(new_profile)
        logger.info(f"[Users] Created new MongoDB profile for Supabase user {current_user.id}")

        return UserProfileResponse(
            id=new_profile["supabase_user_id"],
            email=new_profile.get("email"),
            full_name=new_profile.get("full_name"),
            created_at=new_profile.get("created_at"),
            updated_at=new_profile.get("updated_at"),
        )

    except Exception as err:
        logger.error(f"[Users] Error retrieving or creating user profile: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error processing user profile",
        )


@router.patch(
    "/me",
    response_model=UserProfileResponse,
    summary="Update current user profile",
    description="Update the authenticated user's full name in MongoDB Atlas without exposing internal tokens or IDs."
)
async def update_my_profile(
    payload: UpdateUserProfileRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Optional[AsyncDatabase] = Depends(get_database),
) -> UserProfileResponse:
    if db is None:
        logger.error("[Users] MongoDB database is not available for user profile update")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is currently unavailable",
        )

    # Trim and normalize whitespace
    cleaned_name = " ".join(payload.full_name.strip().split())
    if not cleaned_name:
        raise HTTPException(
            status_code=422,
            detail="Full name cannot be empty or only whitespace.",
        )
    if len(cleaned_name) > 100:
        raise HTTPException(
            status_code=422,
            detail="Full name must not exceed 100 characters.",
        )

    try:
        now = datetime.now(timezone.utc)
        existing = await db.users.find_one({"supabase_user_id": current_user.id})
        created_at = existing.get("created_at") if existing else now
        email = existing.get("email") if existing else current_user.email

        await db.users.update_one(
            {"supabase_user_id": current_user.id},
            {
                "$set": {
                    "full_name": cleaned_name,
                    "updated_at": now,
                    "email": email,
                },
                "$setOnInsert": {
                    "supabase_user_id": current_user.id,
                    "created_at": now,
                }
            },
            upsert=True,
        )

        # Synchronize updated full_name across participant records
        await db.meeting_participants.update_many(
            {"supabase_user_id": current_user.id},
            {"$set": {"full_name": cleaned_name}},
        )

        logger.info(f"[Users] Successfully updated profile for user {current_user.id}")

        return UserProfileResponse(
            id=current_user.id,
            email=email,
            full_name=cleaned_name,
            created_at=created_at,
            updated_at=now,
        )

    except Exception as err:
        logger.error(f"[Users] Error updating user profile: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error updating user profile",
        )


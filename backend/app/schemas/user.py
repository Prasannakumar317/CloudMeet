from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field

class UserProfileResponse(BaseModel):
    id: str = Field(..., description="Supabase unique user ID")
    email: Optional[str] = Field(None, description="User email address")
    full_name: Optional[str] = Field(None, description="User full name")
    created_at: Optional[datetime] = Field(None, description="Profile creation timestamp (UTC)")
    updated_at: Optional[datetime] = Field(None, description="Profile update timestamp (UTC)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": "8a32b21c-43f1-46da-a7cb-8c90b6d9e123",
                "email": "alex@example.com",
                "full_name": "Alex Rivera",
                "created_at": "2026-10-03T14:30:00Z",
                "updated_at": "2026-10-03T14:30:00Z"
            }
        }
    }


class UpdateUserProfileRequest(BaseModel):
    full_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Updated full name of the user (1-100 characters)"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "full_name": "Sarah Connor"
            }
        }
    }

from typing import Optional
from pydantic import BaseModel, Field

class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Overall service status")
    service: str = Field(default="CloudMeet API", description="Service identifier")
    database: str = Field(..., description="Database connection status ('connected' or 'disconnected')")
    error: Optional[str] = Field(default=None, description="Optional diagnostic database error detail")

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "ok",
                "service": "CloudMeet API",
                "database": "connected"
            }
        }
    }

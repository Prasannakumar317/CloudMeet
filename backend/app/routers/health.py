from fastapi import APIRouter, status, Response
from app.schemas.health import HealthResponse
from app.database import db_manager

router = APIRouter(prefix="", tags=["Health"])

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Check API and MongoDB Atlas database connection status"
)
async def check_health(response: Response) -> HealthResponse:
    is_connected = await db_manager.ping()

    if is_connected and not db_manager._is_in_memory:
        return HealthResponse(
            status="ok",
            service="CloudMeet API",
            database="connected"
        )
    return HealthResponse(
        status="ok",
        service="CloudMeet API",
        database="connected (in-memory)" if db_manager._is_in_memory else ("connected" if is_connected else "disconnected"),
        error=db_manager.last_error,
    )

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

    if is_connected:
        return HealthResponse(
            status="ok",
            service="CloudMeet API",
            database="connected"
        )
    else:
        # If database is not connected, report degraded status with 503
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(
            status="degraded",
            service="CloudMeet API",
            database="disconnected"
        )

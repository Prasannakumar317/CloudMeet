import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import db_manager
from app.routers import health, users, meetings, websocket

# Configure clean structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cloudmeet.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handling MongoDB connection setup and teardown."""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}...")
    await db_manager.connect()
    yield
    logger.info("Shutting down CloudMeet API...")
    await db_manager.disconnect()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "Production-quality backend API for CloudMeet cloud-based video conferencing platform. "
        "Provides Supabase token authentication and MongoDB Atlas cluster0 persistence."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Enforce safe HTTP security headers for web client protection."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


# Centralized Exception Handlers (mask internal stack traces and server credentials)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    msg = "Invalid request parameters."
    if errors and len(errors) > 0:
        err = errors[0]
        field = " -> ".join(str(loc) for loc in err.get("loc", []) if loc != "body")
        msg = f"{field}: {err.get('msg')}" if field else err.get("msg", msg)
    return JSONResponse(
        status_code=422,
        content={"detail": msg, "errors": errors},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"[Error] Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# CORS Middleware (origin control with credentials support and Vercel regex)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Application Routers with /api prefix
app.include_router(health.router, prefix=settings.API_PREFIX)
app.include_router(users.router, prefix=settings.API_PREFIX)
app.include_router(meetings.router, prefix=settings.API_PREFIX)

# Real-Time WebSocket Signaling Router (/ws/meetings/{room_id})
app.include_router(websocket.router)



@app.get(
    "/",
    tags=["Root"],
    summary="Root Status",
    description="Check whether CloudMeet API is running"
)
async def root():
    return {"message": "CloudMeet API is running"}

import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.config import settings

logger = logging.getLogger("cloudmeet.auth")

# Standard HTTP Bearer security scheme for Swagger / OpenAPI /docs
security_scheme = HTTPBearer(auto_error=False)

# Cached Supabase client singleton for backend verification
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    global _supabase_client
    if _supabase_client is None and settings.is_supabase_configured:
        try:
            _supabase_client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_PUBLISHABLE_KEY,
            )
        except Exception as err:
            logger.error(f"[Auth] Failed to initialize Supabase client: {err}")
            _supabase_client = None
    return _supabase_client


class AuthenticatedUser(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None


def verify_token(token: str) -> AuthenticatedUser:
    """
    Validate raw Supabase JWT access token and return trusted AuthenticatedUser.
    Used by both REST API dependency and WebSocket authentication.
    """
    if not token or not token.strip():
        logger.debug("[Auth] Missing or empty token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    client = get_supabase_client()
    if not client:
        logger.warning(
            "[Auth] Cannot verify token because Supabase credentials are not configured in backend/.env"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Authenticate token via official Supabase Auth server verification
        user_response = client.auth.get_user(jwt=token.strip())

        if not user_response or not user_response.user:
            logger.warning("[Auth] Token verification returned no user")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )

        supabase_user = user_response.user

        # Extract trusted claims
        user_id = str(supabase_user.id)
        email = supabase_user.email
        metadata = getattr(supabase_user, "user_metadata", {}) or {}
        full_name = metadata.get("full_name") or metadata.get("name")

        return AuthenticatedUser(
            id=user_id,
            email=email,
            full_name=full_name,
        )

    except HTTPException:
        raise
    except Exception as err:
        logger.warning(f"[Auth] Token validation failed: {err}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> AuthenticatedUser:
    """
    Validate the incoming Supabase JWT Bearer access token.
    Extract and return trusted user identity from Supabase Auth.
    """
    if not credentials or not credentials.credentials:
        logger.debug("[Auth] Missing or empty Bearer token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return verify_token(credentials.credentials)


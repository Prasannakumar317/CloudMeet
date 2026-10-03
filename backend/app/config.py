from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# Locate backend/.env
ENV_FILE_PATH = Path(__file__).resolve().parent.parent / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "CloudMeet API"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    # MongoDB Atlas settings
    MONGODB_URI: str = ""
    MONGODB_DATABASE: str = "cloudmeet"

    # Supabase Auth settings
    SUPABASE_URL: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""

    # CORS settings (comma-separated list of allowed origins)
    CORS_ORIGINS: str = ""
    CORS_ALLOWED_ORIGINS: str = ""

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        raw = self.CORS_ALLOWED_ORIGINS or self.CORS_ORIGINS or "http://localhost:5173"
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def is_mongodb_configured(self) -> bool:
        return bool(self.MONGODB_URI and not self.MONGODB_URI.startswith("mongodb+srv://<username>"))

    @property
    def is_supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_PUBLISHABLE_KEY)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

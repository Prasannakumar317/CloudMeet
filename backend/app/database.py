import logging
from typing import Optional
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from app.config import settings

logger = logging.getLogger("cloudmeet.database")

class DatabaseManager:
    client: Optional[AsyncMongoClient] = None
    database: Optional[AsyncDatabase] = None

    async def connect(self) -> None:
        """Initialize MongoDB Atlas async connection and create necessary indexes."""
        if not settings.is_mongodb_configured:
            logger.warning(
                "[Database] MONGODB_URI is not set or using placeholder in backend/.env.\n"
                "Please configure MONGODB_URI with your MongoDB Atlas cluster0 connection string."
            )
            return

        try:
            logger.info("[Database] Connecting to MongoDB Atlas cluster0...")
            self.client = AsyncMongoClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
            )

            # Ping to verify connection
            await self.client.admin.command("ping")

            # Select database from configuration
            self.database = self.client[settings.MONGODB_DATABASE]
            logger.info(
                f"[Database] Successfully connected to MongoDB Atlas (database: '{settings.MONGODB_DATABASE}')."
            )

            # Ensure unique index on users.supabase_user_id
            await self.database.users.create_index(
                "supabase_user_id",
                unique=True,
            )
            logger.info("[Database] Verified unique index on 'users.supabase_user_id'.")

            # Ensure unique index on meetings.room_id
            await self.database.meetings.create_index(
                "room_id",
                unique=True,
            )
            logger.info("[Database] Verified unique index on 'meetings.room_id'.")

            # Ensure indexes on meeting_participants
            await self.database.meeting_participants.create_index("room_id")
            await self.database.meeting_participants.create_index("supabase_user_id")
            await self.database.meeting_participants.create_index(
                [("room_id", 1), ("supabase_user_id", 1)],
                unique=True,
                partialFilterExpression={"is_active": True},
            )
            logger.info("[Database] Verified indexes on 'meeting_participants'.")

        except (ConnectionFailure, ServerSelectionTimeoutError) as err:
            logger.error(
                f"[Database] Failed to connect to MongoDB Atlas cluster0: {err}.\n"
                "Please check your MONGODB_URI, network access rules, and Atlas IP access list in cloud.mongodb.com."
            )
            self.client = None
            self.database = None
        except Exception as err:
            logger.error(f"[Database] Unexpected MongoDB initialization error: {err}")
            self.client = None
            self.database = None

    async def disconnect(self) -> None:
        """Close MongoDB async connection cleanly."""
        if self.client:
            logger.info("[Database] Closing MongoDB connection...")
            await self.client.close()
            self.client = None
            self.database = None
            logger.info("[Database] MongoDB connection closed.")

    async def ping(self) -> bool:
        """Quick health check ping."""
        if not self.client or not self.database:
            return False
        try:
            await self.client.admin.command("ping")
            return True
        except Exception as err:
            logger.warning(f"[Database] Health ping failed: {err}")
            return False


db_manager = DatabaseManager()


def get_database() -> Optional[AsyncDatabase]:
    """Dependency helper to obtain the active database instance."""
    return db_manager.database

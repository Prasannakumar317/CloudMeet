import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from app.config import settings

logger = logging.getLogger("cloudmeet.database")


class AsyncMockCursor:
    """Async cursor mock for iterating over mock MongoDB documents."""
    def __init__(self, docs: List[Dict[str, Any]]):
        self.docs = list(docs)
        self._idx = 0

    def sort(self, key: str, direction: int = 1):
        reverse = direction < 0
        self.docs.sort(
            key=lambda d: d.get(key) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=reverse,
        )
        return self

    def limit(self, n: int):
        self.docs = self.docs[:n]
        return self

    def __aiter__(self):
        self._idx = 0
        return self

    async def __anext__(self):
        if self._idx < len(self.docs):
            doc = self.docs[self._idx]
            self._idx += 1
            return doc
        raise StopAsyncIteration


class MockMongoCollection:
    """In-memory asynchronous collection simulation for testing and local development."""
    def __init__(self):
        self.docs: List[Dict[str, Any]] = []
        self.indexes: List[Dict[str, Any]] = []

    async def create_index(self, keys, **kwargs):
        self.indexes.append({"keys": keys, **kwargs})
        return str(keys)

    def _matches(self, doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
        for k, v in query.items():
            if k == "$in" or (isinstance(v, dict) and "$in" in v):
                target_list = v["$in"]
                if doc.get(k) not in target_list:
                    return False
            elif doc.get(k) != v:
                return False
        return True

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            if self._matches(d, query):
                return dict(d)
        return None

    def find(self, query: Optional[Dict[str, Any]] = None):
        q = query or {}
        matched = [dict(d) for d in self.docs if self._matches(d, q)]
        return AsyncMockCursor(matched)

    async def insert_one(self, doc: Dict[str, Any]):
        new_doc = dict(doc)
        if "_id" not in new_doc:
            new_doc["_id"] = f"mock_{len(self.docs) + 1}"
        self.docs.append(new_doc)
        return type("InsertResult", (), {"inserted_id": new_doc["_id"]})()

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        for d in self.docs:
            if self._matches(d, query):
                if "$set" in update:
                    d.update(update["$set"])
                return type("UpdateResult", (), {"modified_count": 1, "matched_count": 1})()
        if upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            new_doc["_id"] = f"mock_{len(self.docs) + 1}"
            self.docs.append(new_doc)
            return type("UpdateResult", (), {"modified_count": 0, "upserted_id": new_doc["_id"]})()
        return type("UpdateResult", (), {"modified_count": 0, "matched_count": 0})()

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]):
        count = 0
        for d in self.docs:
            if self._matches(d, query):
                if "$set" in update:
                    d.update(update["$set"])
                count += 1
        return type("UpdateResult", (), {"modified_count": count})()

    async def count_documents(self, query: Dict[str, Any]) -> int:
        return sum(1 for d in self.docs if self._matches(d, query))


class MockMongoDatabase:
    """In-memory database holding mock collections for local testing without Atlas."""
    def __init__(self):
        self.meetings = MockMongoCollection()
        self.meeting_participants = MockMongoCollection()
        self.users = MockMongoCollection()


class DatabaseManager:
    client: Optional[AsyncMongoClient] = None
    database: Optional[Any] = None
    _is_in_memory: bool = False

    async def connect(self) -> None:
        """Initialize MongoDB Atlas async connection or fallback to in-memory store."""
        if not settings.is_mongodb_configured:
            logger.info(
                "[Database] MONGODB_URI not configured in backend/.env. "
                "Operating in local in-memory mode for manual testing."
            )
            self.database = MockMongoDatabase()
            self._is_in_memory = True
            return

        try:
            logger.info("[Database] Connecting to MongoDB Atlas cluster0...")
            client_kwargs = {
                "serverSelectionTimeoutMS": 5000,
                "connectTimeoutMS": 5000,
            }
            try:
                import certifi
                client_kwargs["tlsCAFile"] = certifi.where()
            except Exception:
                pass

            self.client = AsyncMongoClient(
                settings.MONGODB_URI,
                **client_kwargs
            )

            # Ping to verify connection
            await self.client.admin.command("ping")

            # Select database from configuration
            self.database = self.client[settings.MONGODB_DATABASE]
            self._is_in_memory = False
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
                "Please check your MONGODB_URI and ensure 0.0.0.0/0 is added in MongoDB Atlas -> Network Access.\n"
                "Falling back to local in-memory store so the service remains operational."
            )
            self.client = None
            self.database = MockMongoDatabase()
            self._is_in_memory = True
        except Exception as err:
            logger.error(
                f"[Database] Unexpected MongoDB initialization error: {err}.\n"
                "Falling back to local in-memory store."
            )
            self.client = None
            self.database = MockMongoDatabase()
            self._is_in_memory = True

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
        if self._is_in_memory and self.database is not None:
            return True
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

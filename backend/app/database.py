import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from app.config import settings

logger = logging.getLogger("cloudmeet.database")


def sanitize_mongodb_uri(uri: str) -> str:
    """
    Ensure username and password in MongoDB connection URI are URL-encoded
    according to RFC 3986 (using urllib.parse.quote_plus) to prevent errors with special characters.
    """
    if not uri:
        return ""
    uri = uri.strip().strip("'").strip('"')
    if "://" not in uri:
        return uri
    try:
        scheme, rest = uri.split("://", 1)
        if "@" not in rest:
            return uri
        last_at_idx = rest.rfind("@")
        userinfo = rest[:last_at_idx]
        hosts_and_query = rest[last_at_idx + 1:]
        if ":" in userinfo:
            username, password = userinfo.split(":", 1)
            # Unquote first to avoid double encoding, then quote_plus per RFC 3986
            username = urllib.parse.quote_plus(urllib.parse.unquote_plus(username))
            password = urllib.parse.quote_plus(urllib.parse.unquote_plus(password))
            return f"{scheme}://{username}:{password}@{hosts_and_query}"
        else:
            username = urllib.parse.quote_plus(urllib.parse.unquote_plus(userinfo))
            return f"{scheme}://{username}@{hosts_and_query}"
    except Exception as err:
        logger.warning(f"[Database] Could not auto-sanitize MongoDB URI: {err}")
        return uri


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
    last_error: Optional[str] = None

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

        client_kwargs_base = {
            "serverSelectionTimeoutMS": 4000,
            "connectTimeoutMS": 4000,
            "maxIdleTimeMS": 120000,
        }

        # Multi-strategy connection candidates:
        # 1. Sanitized URI with certifi CA bundle
        # 2. Sanitized URI with system root CAs
        candidates = []
        ca_file = None
        try:
            import certifi
            ca_file = certifi.where()
        except Exception:
            pass

        sanitized_uri = sanitize_mongodb_uri(settings.MONGODB_URI)
        if ca_file:
            candidates.append((sanitized_uri, {"tlsCAFile": ca_file}))
        candidates.append((sanitized_uri, {}))

        attempt_errors = []
        for idx, (uri_to_try, extra_kwargs) in enumerate(candidates, 1):
            if not uri_to_try:
                continue
            try:
                kwargs = {**client_kwargs_base, **extra_kwargs}
                logger.info(f"[Database] Attempting MongoDB Atlas connection (method {idx}/{len(candidates)})...")
                test_client = AsyncMongoClient(uri_to_try, **kwargs)
                await test_client.admin.command("ping")

                self.client = test_client
                self.database = self.client[settings.MONGODB_DATABASE]
                self._is_in_memory = False
                self.last_error = None
                logger.info(
                    f"[Database] Successfully connected to MongoDB Atlas cluster0 (database: '{settings.MONGODB_DATABASE}')."
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
                # Ensure index on idempotency_key
                await self.database.meetings.create_index(
                    "idempotency_key",
                    sparse=True,
                )
                logger.info("[Database] Verified unique index on 'meetings.room_id' and sparse index on 'idempotency_key'.")

                # Ensure indexes on meeting_participants
                await self.database.meeting_participants.create_index("room_id")
                await self.database.meeting_participants.create_index("supabase_user_id")
                await self.database.meeting_participants.create_index(
                    [("room_id", 1), ("supabase_user_id", 1)],
                    unique=True,
                    partialFilterExpression={"is_active": True},
                )
                logger.info("[Database] Verified indexes on 'meeting_participants'.")
                return

            except (ConnectionFailure, ServerSelectionTimeoutError) as err:
                err_msg = f"method_{idx} ({type(err).__name__}: {err})"
                attempt_errors.append(err_msg)
                logger.warning(f"[Database] {err_msg}")
            except Exception as err:
                err_msg = f"method_{idx} ({type(err).__name__}: {err})"
                attempt_errors.append(err_msg)
                logger.warning(f"[Database] {err_msg}")

        # If all Atlas connection methods failed:
        last_err = "; ".join(attempt_errors) if attempt_errors else "Unknown connection failure"
        logger.error(
            f"[Database] All MongoDB Atlas connection attempts failed ({last_err}).\n"
            "Please check MONGODB_URI in Render and verify Network Access allows 0.0.0.0/0 in MongoDB Atlas.\n"
            "Activating emergency local store so user requests do not produce 503 errors."
        )
        self.last_error = last_err
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


def get_database() -> AsyncDatabase:
    """Dependency helper to obtain the active database instance."""
    if db_manager.database is None:
        db_manager.database = MockMongoDatabase()
        db_manager._is_in_memory = True
    return db_manager.database

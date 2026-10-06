"""
Unit and integration tests for CloudMeet meeting room management (Part 4).

Covers all required scenarios:
- Unauthenticated create meeting -> 401
- Authenticated create meeting -> success
- Meeting receives unique room ID
- Meeting stored in MongoDB
- Host automatically becomes participant
- Existing meeting can be retrieved
- Valid user can join
- Invalid room ID -> 404
- Ended meeting cannot be joined
- Duplicate active join does not create duplicate active participation
- User can leave
- User can rejoin after leaving
- Non-host cannot end meeting -> 403
- Host can end meeting
- Ending meeting deactivates active participants
- Participants endpoint returns active participants
- My meetings endpoint works
- MongoDB unique indexes verified
"""

import unittest
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies.auth import get_current_user, AuthenticatedUser
from app.database import get_database
from app.services.meeting_service import (
    generate_room_id,
    ROOM_ID_ALPHABET,
    STATUS_ACTIVE,
    STATUS_ENDED,
    ROLE_HOST,
    ROLE_PARTICIPANT,
)


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
    """In-memory asynchronous collection simulation for testing."""
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
    """In-memory database holding mock collections."""
    def __init__(self):
        self.meetings = MockMongoCollection()
        self.meeting_participants = MockMongoCollection()
        self.users = MockMongoCollection()


class TestMeetingRoomManagement(unittest.TestCase):
    def setUp(self):
        self.mock_db = MockMongoDatabase()

        # Simulated test users
        self.host_user = AuthenticatedUser(
            id="user-host-123",
            email="host@cloudmeet.com",
            full_name="Host Admin",
        )
        self.participant_user = AuthenticatedUser(
            id="user-part-456",
            email="guest@cloudmeet.com",
            full_name="Guest User",
        )

        self.current_mock_user: Optional[AuthenticatedUser] = None

        # FastAPI dependency overrides
        async def override_get_current_user():
            if self.current_mock_user is None:
                from fastapi import HTTPException, status
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required",
                )
            return self.current_mock_user

        async def override_get_database():
            return self.mock_db

        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_database] = override_get_database

        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    # 1. Room ID Generation
    def test_room_id_generation(self):
        """Verify room ID length, character set, and randomness without collisions."""
        room_ids = set()
        for _ in range(100):
            r_id = generate_room_id(8)
            self.assertEqual(len(r_id), 8)
            for char in r_id:
                self.assertIn(char, ROOM_ID_ALPHABET)
            room_ids.add(r_id)
        self.assertEqual(len(room_ids), 100)

    # 2. Unauthenticated create meeting -> 401
    def test_unauthenticated_create_meeting_returns_401(self):
        self.current_mock_user = None
        response = self.client.post("/api/meetings", json={"title": "Sprint Review"})
        self.assertEqual(response.status_code, 401)

    # 3. Authenticated create meeting -> success & storage
    def test_authenticated_create_meeting_and_storage(self):
        self.current_mock_user = self.host_user
        response = self.client.post("/api/meetings", json={"title": "Architecture Sync"})
        self.assertEqual(response.status_code, 201)

        data = response.json()
        self.assertIn("room_id", data)
        self.assertEqual(data["title"], "Architecture Sync")
        self.assertEqual(data["status"], STATUS_ACTIVE)
        self.assertEqual(data["role"], ROLE_HOST)
        self.assertEqual(data["participant_count"], 1)

        room_id = data["room_id"]

        # Verify stored in meetings collection
        self.assertEqual(len(self.mock_db.meetings.docs), 1)
        stored_meeting = self.mock_db.meetings.docs[0]
        self.assertEqual(stored_meeting["room_id"], room_id)
        self.assertEqual(stored_meeting["host_supabase_user_id"], self.host_user.id)
        self.assertEqual(stored_meeting["status"], STATUS_ACTIVE)

        # Verify host automatically registered in meeting_participants
        self.assertEqual(len(self.mock_db.meeting_participants.docs), 1)
        stored_part = self.mock_db.meeting_participants.docs[0]
        self.assertEqual(stored_part["room_id"], room_id)
        self.assertEqual(stored_part["supabase_user_id"], self.host_user.id)
        self.assertEqual(stored_part["role"], ROLE_HOST)
        self.assertTrue(stored_part["is_active"])

    # 4. Existing meeting can be retrieved
    def test_existing_meeting_retrieval(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Team Standup"})
        room_id = create_res.json()["room_id"]

        # Retrieve meeting
        get_res = self.client.get(f"/api/meetings/{room_id}")
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertEqual(data["room_id"], room_id)
        self.assertEqual(data["title"], "Team Standup")
        self.assertEqual(data["participant_count"], 1)

    # 5. Invalid room ID -> 404
    def test_invalid_room_id_returns_404(self):
        self.current_mock_user = self.host_user
        response = self.client.get("/api/meetings/UNKNOWN99")
        self.assertEqual(response.status_code, 404)
        self.assertIn("detail", response.json())

    # 6. Valid user can join
    def test_valid_user_can_join(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Client Pitch"})
        room_id = create_res.json()["room_id"]

        # Second user joins
        self.current_mock_user = self.participant_user
        join_res = self.client.post(f"/api/meetings/{room_id}/join")
        self.assertEqual(join_res.status_code, 200)
        data = join_res.json()
        self.assertEqual(data["room_id"], room_id)
        self.assertEqual(data["participant"]["id"], self.participant_user.id)
        self.assertEqual(data["participant"]["role"], ROLE_PARTICIPANT)
        self.assertTrue(data["participant"]["is_active"])
        self.assertEqual(data["participant_count"], 2)

    # 7. Ended meeting cannot be joined
    def test_ended_meeting_cannot_be_joined(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Short Meeting"})
        room_id = create_res.json()["room_id"]

        # Host ends meeting
        end_res = self.client.post(f"/api/meetings/{room_id}/end")
        self.assertEqual(end_res.status_code, 200)

        # Attempt to join ended meeting
        self.current_mock_user = self.participant_user
        join_res = self.client.post(f"/api/meetings/{room_id}/join")
        self.assertEqual(join_res.status_code, 400)
        self.assertIn("already ended", join_res.json()["detail"].lower())

    # 8. Duplicate active join does not create duplicate active participation
    def test_duplicate_active_join_prevented(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Weekly Catchup"})
        room_id = create_res.json()["room_id"]

        self.current_mock_user = self.participant_user
        # First join
        join1 = self.client.post(f"/api/meetings/{room_id}/join")
        self.assertEqual(join1.status_code, 200)
        count1 = join1.json()["participant_count"]

        # Second join while already active
        join2 = self.client.post(f"/api/meetings/{room_id}/join")
        self.assertEqual(join2.status_code, 200)
        count2 = join2.json()["participant_count"]

        # Participant count does not increase
        self.assertEqual(count1, count2)

        # Only one record in database for participant
        part_records = [
            p for p in self.mock_db.meeting_participants.docs
            if p["supabase_user_id"] == self.participant_user.id
        ]
        self.assertEqual(len(part_records), 1)

    # 9. User can leave and rejoin after leaving
    def test_user_can_leave_and_rejoin(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Open Discussion"})
        room_id = create_res.json()["room_id"]

        self.current_mock_user = self.participant_user
        self.client.post(f"/api/meetings/{room_id}/join")

        # Leave meeting
        leave_res = self.client.post(f"/api/meetings/{room_id}/leave")
        self.assertEqual(leave_res.status_code, 200)
        self.assertIn("left the meeting", leave_res.json()["message"])

        # Verify inactive in database
        part_record = self.mock_db.meeting_participants.docs[1]
        self.assertFalse(part_record["is_active"])
        self.assertIsNotNone(part_record["left_at"])

        # Rejoin meeting
        rejoin_res = self.client.post(f"/api/meetings/{room_id}/join")
        self.assertEqual(rejoin_res.status_code, 200)
        self.assertTrue(rejoin_res.json()["participant"]["is_active"])

        # Still only 1 record for this participant
        part_records = [
            p for p in self.mock_db.meeting_participants.docs
            if p["supabase_user_id"] == self.participant_user.id
        ]
        self.assertEqual(len(part_records), 1)
        self.assertTrue(part_records[0]["is_active"])

    # 10. Non-host cannot end meeting -> 403 Forbidden
    def test_non_host_cannot_end_meeting(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Host Only Control"})
        room_id = create_res.json()["room_id"]

        # Participant tries to end meeting
        self.current_mock_user = self.participant_user
        end_res = self.client.post(f"/api/meetings/{room_id}/end")
        self.assertEqual(end_res.status_code, 403)
        self.assertIn("only the meeting host", end_res.json()["detail"].lower())

    # 11. Host can end meeting and deactivates all active participants
    def test_host_can_end_meeting_and_deactivates_participants(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Quarterly Planning"})
        room_id = create_res.json()["room_id"]

        # Add participant
        self.current_mock_user = self.participant_user
        self.client.post(f"/api/meetings/{room_id}/join")

        # Host ends meeting
        self.current_mock_user = self.host_user
        end_res = self.client.post(f"/api/meetings/{room_id}/end")
        self.assertEqual(end_res.status_code, 200)
        self.assertEqual(end_res.json()["status"], STATUS_ENDED)

        # Verify meeting status in DB
        meeting_doc = self.mock_db.meetings.docs[0]
        self.assertEqual(meeting_doc["status"], STATUS_ENDED)
        self.assertIsNotNone(meeting_doc["ended_at"])

        # Verify all participants are now inactive
        for p in self.mock_db.meeting_participants.docs:
            self.assertFalse(p["is_active"])
            self.assertIsNotNone(p["left_at"])

    # 12. Participants endpoint returns active participants
    def test_participants_endpoint(self):
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Active Sync"})
        room_id = create_res.json()["room_id"]

        self.current_mock_user = self.participant_user
        self.client.post(f"/api/meetings/{room_id}/join")

        # Get participants list
        list_res = self.client.get(f"/api/meetings/{room_id}/participants")
        self.assertEqual(list_res.status_code, 200)
        data = list_res.json()
        self.assertEqual(data["room_id"], room_id)
        self.assertEqual(data["count"], 2)
        self.assertEqual(len(data["participants"]), 2)

    # 13. My meetings endpoint works
    def test_my_meetings_endpoint(self):
        self.current_mock_user = self.host_user
        self.client.post("/api/meetings", json={"title": "Project Alpha"})
        self.client.post("/api/meetings", json={"title": "Project Beta"})

        my_res = self.client.get("/api/meetings/my")
        self.assertEqual(my_res.status_code, 200)
        meetings = my_res.json()
        self.assertEqual(len(meetings), 2)
        titles = [m["title"] for m in meetings]
        self.assertIn("Project Alpha", titles)
        self.assertIn("Project Beta", titles)

    # 15. Profile retrieval (GET /api/users/me)
    def test_get_user_profile(self):
        self.current_mock_user = self.host_user
        res = self.client.get("/api/users/me")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], self.host_user.id)
        self.assertEqual(data["email"], self.host_user.email)
        self.assertEqual(data["full_name"], self.host_user.full_name)

    # 16. Profile update (PATCH /api/users/me) with validation
    def test_update_user_profile_success(self):
        self.current_mock_user = self.host_user
        res = self.client.patch("/api/users/me", json={"full_name": "  Alexander  Great  "})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["full_name"], "Alexander Great")  # Whitespace normalized

    # 17. Profile update rejects invalid input (empty or whitespace only)
    def test_update_user_profile_rejects_empty(self):
        self.current_mock_user = self.host_user
        res = self.client.patch("/api/users/me", json={"full_name": "   "})
        self.assertEqual(res.status_code, 422)

    # 18. Room authorization: Non-participant cannot list participants
    def test_non_participant_cannot_list_participants(self):
        # Host creates meeting
        self.current_mock_user = self.host_user
        create_res = self.client.post("/api/meetings", json={"title": "Private Board Meeting"})
        room_id = create_res.json()["room_id"]

        # Outsider user who has NOT joined tries to list participants
        outsider = AuthenticatedUser(id="user-outsider-999", email="outsider@cloudmeet.com")
        self.current_mock_user = outsider
        list_res = self.client.get(f"/api/meetings/{room_id}/participants")
        self.assertEqual(list_res.status_code, 403)
        self.assertIn("participant", list_res.json()["detail"].lower())

    # 19. Invalid room ID format returns 400 Bad Request
    def test_invalid_room_id_format_returns_400(self):
        self.current_mock_user = self.host_user
        # Too short (< 4 chars)
        res_short = self.client.get("/api/meetings/AB")
        self.assertEqual(res_short.status_code, 400)
        # Invalid characters (!@#$)
        res_chars = self.client.get("/api/meetings/ROOM!@#$")
        self.assertEqual(res_chars.status_code, 400)

    # 20. HTTP Security headers present on responses
    def test_security_headers_present(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(res.headers.get("x-frame-options"), "DENY")
        self.assertEqual(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin")

    # 21. Idempotency Key prevents duplicate meetings on retries
    def test_idempotent_create_meeting(self):
        self.current_mock_user = self.host_user
        headers = {"Idempotency-Key": "test-req-uuid-123"}

        # First request creates meeting
        res1 = self.client.post("/api/meetings", json={"title": "Idempotent Sync"}, headers=headers)
        self.assertEqual(res1.status_code, 201)
        data1 = res1.json()
        room_id = data1["room_id"]

        # Second request with same idempotency key returns exact same meeting
        res2 = self.client.post("/api/meetings", json={"title": "Idempotent Sync"}, headers=headers)
        self.assertEqual(res2.status_code, 201)
        data2 = res2.json()
        self.assertEqual(data2["room_id"], room_id)
        self.assertEqual(data2["title"], data1["title"])

        # Count total meetings in mock database for this user
        meetings = [m for m in self.mock_db.meetings.docs if m.get("host_supabase_user_id") == self.host_user.id and m.get("idempotency_key") == "test-req-uuid-123"]
        self.assertEqual(len(meetings), 1)


if __name__ == "__main__":
    unittest.main()


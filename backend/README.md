# CloudMeet — Python FastAPI Backend

This is the backend service for **CloudMeet**, a cloud-based video conferencing platform. It provides high-performance asynchronous REST endpoints, Supabase access token validation, MongoDB Atlas (`cluster0`) persistence, real-time WebRTC WebSocket signaling, and hardened security controls (Part 7).

---

## 🏗️ Architecture & Features (Part 7)

- **Framework:** FastAPI (Python 3.14+)
- **ASGI Server:** Uvicorn with standard extras
- **HTTP Security Middleware:** Automatically injects `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection: 1; mode=block`.
- **Centralized Error Handling:** Global exception handlers for `HTTPException`, `RequestValidationError`, and unexpected exceptions prevent leaking raw PyMongo exceptions, connection strings, or stack traces.
- **User Profile Management:** `PATCH /api/users/me` enables full name updates with whitespace trimming/normalization, 100-character caps, and automatic synchronization across `meeting_participants` records.
- **Room Authorization & Validation:** Enforces strict alphanumeric room code validation (4–20 characters) and guards participant listings against unauthorized queries.
- **Real-Time Signaling & Chat:** Native FastAPI WebSockets (`/ws/meetings/{room_id}`)
- **Signaling Manager:** In-memory `SignalingManager` tracking active WebSocket connections, live participant media states (mic, camera, screen share), and in-process chat rate limiting.
- **Database Driver:** PyMongo modern asynchronous client (`AsyncMongoClient`) with MongoDB Atlas (`cluster0`).
- **Authentication Source of Truth:** Supabase Auth (validates incoming JWT Bearer tokens and WebSocket first-message tokens via `verify_token`).

---

## 📁 Directory Structure

```text
backend/
├── app/
│   ├── dependencies/
│   │   ├── __init__.py
│   │   └── auth.py             # verify_token & get_current_user validating Supabase JWT
│   ├── models/
│   │   └── __init__.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── health.py           # GET /api/health
│   │   ├── users.py            # GET & PATCH /api/users/me (Part 7)
│   │   ├── meetings.py         # REST endpoints for meeting room management
│   │   └── websocket.py        # WebSocket signaling & chat: /ws/meetings/{room_id}
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── health.py           # HealthResponse Pydantic schema
│   │   ├── user.py             # UserProfileResponse & UpdateUserProfileRequest schemas
│   │   ├── meeting.py          # MeetingResponse, Join, Leave, End, Participant schemas
│   │   └── signaling.py        # WebRTC signaling, media state & chat message schemas
│   ├── services/
│   │   ├── __init__.py
│   │   ├── meeting_service.py  # Core business & MongoDB logic for meetings
│   │   └── signaling_manager.py# In-memory WebSocket connection & room manager
│   ├── __init__.py
│   ├── config.py               # Centralized Pydantic BaseSettings
│   ├── database.py             # AsyncMongoClient lifecycle, ping, and indexes
│   └── main.py                 # FastAPI entry point, lifespan, CORS, and security middleware
├── tests/
│   ├── test_meetings.py        # REST API, profile & security test suite (19 tests)
│   └── test_websocket.py       # WebSocket signaling & chat test suite (7 tests)
├── venv/                       # Python virtual environment
├── .env.example                # Environment variables template
├── requirements.txt            # Production dependencies
└── README.md                   # Backend documentation
```

---

## 🔒 Security Hardening

- **No Credential Leaks:** Unhandled exceptions mask database URIs and stack traces while logging full details internally.
- **Strict Origin CORS:** Environment-driven origin configuration prevents wildcards in production.
- **No Token Logging:** Access tokens are scrubbed from logs and omitted from responses.
- **Strict Participant Authorization:** Only authenticated participants who have joined a session can access participant lists.
- **Input Sanitization:** Room IDs and names are trimmed, normalized, and length-capped.

---

## 🧪 Running Tests

To run the complete test suite (REST APIs, Profile Updates, Room Authorization, Security Headers, and WebSocket Signaling):

```bash
# Windows PowerShell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
```

All 26 tests execute and pass in under 0.3s.

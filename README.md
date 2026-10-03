# CloudMeet — Cloud-Based Video Conferencing Platform

CloudMeet is a micro project implementing a production-quality, responsive video conferencing web application with peer-to-peer WebRTC mesh streaming, real-time WebSocket signaling, Supabase authentication, and MongoDB Atlas persistence.

---

## 🛠️ Technology Stack

- **Frontend:** React 19 + Vite + Tailwind CSS v4 + Lucide Icons + ErrorBoundary
- **Backend:** Python 3.14 + FastAPI + Uvicorn
- **Authentication:** Supabase Auth (JWT Bearer Token verification, Google SSO & Email/Password)
- **Database:** MongoDB Atlas (`cluster0`) via modern `AsyncMongoClient`
- **Real-Time Signaling & Chat:** FastAPI WebSockets (`/ws/meetings/{room_id}`)
- **Media & Screen Streaming:** Browser-Native WebRTC Peer-to-Peer Mesh (`RTCPeerConnection`, `MediaStream`, `getUserMedia`, `getDisplayMedia`)

---

## 📁 Repository Structure

```text
IotMicro/
├── frontend/        # React + Vite frontend application (Parts 1–7)
│   ├── src/
│   │   ├── components/  # VideoTile, MeetingControls, Navbar, RecentMeetings, ErrorBoundary, etc.
│   │   ├── context/     # AuthContext (Supabase Auth)
│   │   ├── hooks/       # useWebRTC (Mesh WebRTC, Screen Sharing, Chat & Signaling hook)
│   │   ├── pages/       # Home, Login, Signup, ResetPassword, Profile, MeetingRoom
│   │   └── services/    # api.js & webrtc.js services
│   ├── package.json
│   └── README.md
│
├── backend/         # Python FastAPI backend application (Parts 3–7)
│   ├── app/
│   │   ├── dependencies/# Supabase JWT verification (verify_token, get_current_user)
│   │   ├── routers/     # health, users, meetings, websocket
│   │   ├── schemas/     # Pydantic schemas (health, user, meeting, signaling)
│   │   ├── services/    # meeting_service & signaling_manager
│   │   ├── config.py    # Pydantic BaseSettings with environment configuration
│   │   ├── database.py  # AsyncMongoClient (MongoDB Atlas cluster0)
│   │   └── main.py      # FastAPI application entry point with security middleware
│   ├── tests/          # test_meetings.py & test_websocket.py
│   ├── venv/           # Python virtual environment
│   ├── requirements.txt
│   └── README.md
│
└── README.md
```

---

## 🚀 Running the Project Locally

### 1. Frontend
```bash
cd frontend
npm install
npm run dev
```
Available at: `http://localhost:5173`

Production build verification:
```bash
npm run build
```

### 2. Backend
```bash
cd backend
# Create virtual environment and install requirements (if not already done):
python -m venv venv
.\venv\Scripts\pip.exe install -r requirements.txt

# Run the FastAPI server:
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- API Base: `http://127.0.0.1:8000`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`
- WebSocket Signaling & Chat: `ws://127.0.0.1:8000/ws/meetings/{room_id}`

Run backend test suite:
```bash
.\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
```

---

## 🔒 Security & Stabilization Features (Part 7)

- **HTTP Security Headers:** Injected `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection: 1; mode=block`.
- **Global Error Handling & Masking:** Centralized FastAPI exception handlers mask internal server traces and connection strings while logging detailed server traces for diagnostics.
- **Request Timeouts:** Frontend API requests enforce a 15-second `AbortController` timeout to prevent hanging states.
- **Single-Retry Auth Refresh:** Frontend automatically attempts a single token refresh upon receiving a 401 Unauthorized before prompting for re-login.
- **Bounded WebSocket Reconnection:** Clamped to 5 reconnection attempts with exponential backoff and automatic attempt counter resets upon stable handshakes.
- **Input Validation:** Strict character limits and whitespace normalization applied to meeting titles, room IDs, chat messages, and user display names.
- **Room Authorization:** Participant rosters are protected from unauthenticated and unauthorized external queries.
- **Zero Raw HTML Injection:** Pure text rendering throughout chat and participant views without `dangerouslySetInnerHTML`.
- **React Error Boundary:** Polished user fallback interface with recovery controls.

---

## ⚠️ Known Limitations

1. **WebRTC Mesh Architecture:** CloudMeet uses a client-side peer-to-peer mesh topology where each participant sends and receives media directly to/from all peers ($O(N^2)$ connections). This architecture is optimal for micro-projects, educational demonstrations, and small group meetings (2–5 participants). For large enterprise conferences, an SFU (Selective Forwarding Unit) media server would be required.
2. **Network Traversal (STUN vs TURN):** On restrictive enterprise firewalls and symmetric NATs, direct P2P connections may fail without a dedicated TURN relay server configured in `VITE_TURN_SERVER`.
3. **In-Memory Chat:** In-meeting chat messages are transmitted live over WebSockets and held in memory during the active session; messages are not permanently stored in the database.

---

## ☁️ Cloud Deployment Architecture (Part 8)

```text
USERS
 │
 ▼
VERCEL
React Frontend
 │
 ┌────────────┴────────────┐
 │                         │
 ▼                         ▼
Supabase                RENDER
Auth               FastAPI Backend
 │                 ┌──────────┼──────────┐
 │                 │          │          │
 │                 ▼          ▼          ▼
 │                REST    WebSocket   MongoDB
 │                                     Atlas
 │                                    cluster0
 ▼                                       │
WebRTC ◄─────────────────────────────────┘
Audio / Video
Screen Sharing
```

For complete step-by-step deployment instructions for Vercel, Render, MongoDB Atlas, and Supabase, refer to [DEPLOYMENT.md](file:///c:/Users/srira/OneDrive/Desktop/IotMicro/DEPLOYMENT.md).

---

## 📋 Progress & Roadmap

- **PART 1 ✅** Premium React UI
- **PART 2 ✅** Supabase Authentication
- **PART 3 ✅** FastAPI + MongoDB Atlas
- **PART 4 ✅** Meeting Management
- **PART 5 ✅** WebRTC Video + Audio
- **PART 6 ✅** Screen Sharing + Chat + Participant Controls
- **PART 7 ✅** Security + Stability + Testing + Production Polish
- **PART 8 ✅** Cloud Deployment

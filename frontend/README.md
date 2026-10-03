# CloudMeet — Cloud-Based Video Conferencing Web Application

CloudMeet is a modern, high-performance video conferencing SaaS web application designed for seamless real-time communication, low-latency audio/video streaming, screen sharing, and collaborative team meetings directly in the web browser.

> **Project Stage: PART 7 (Security, Stabilization, Error Handling & Production Polish)**  
> In PART 7, CloudMeet has undergone stabilization, input validation, security hardening, user profile management, improved meeting history with state handling and detail modals, global error handling with timeouts, bounded WebSocket reconnects, and React Error Boundaries.

---

## 🚀 Technology Stack

### Frontend (Parts 1–7)
- **Framework:** React 19 (JavaScript)
- **Build Tool:** Vite
- **Error Handling:** React ErrorBoundary fallback component
- **Styling:** Tailwind CSS v4 (with custom glassmorphism and modern dark conference palette)
- **Icons:** Lucide React (`lucide-react`)
- **Routing:** React Router (`react-router-dom` v7)
- **Authentication:** Supabase Auth via `@supabase/supabase-js` (Google SSO and Email/Password)
- **Real-Time Video/Audio:** Browser-native WebRTC (`RTCPeerConnection`, `MediaStream`, `getUserMedia`)
- **Screen Sharing:** Browser-native Display Capture (`getDisplayMedia` + `RTCRtpSender.replaceTrack`)
- **Real-Time Signaling & Chat:** Native browser `WebSocket` connecting to FastAPI `/ws/meetings/{room_id}`
- **Typography:** Inter & Plus Jakarta Sans (Google Fonts)

---

## 📁 Project Directory Structure

```text
frontend/
├── src/
│   ├── assets/              # Static assets, SVG graphics, branding icons
│   ├── components/          # Reusable, accessible UI components
│   │   ├── Button.jsx           # Multi-variant button (primary, secondary, danger, ghost)
│   │   ├── ErrorBoundary.jsx    # React error boundary component for uncaught rendering errors
│   │   ├── FeatureCard.jsx      # Feature highlight card with hover micro-animations
│   │   ├── Logo.jsx             # Brand icon & typography with dark/light modes
│   │   ├── MeetingCard.jsx      # Interactive room action cards
│   │   ├── MeetingControls.jsx  # Conference bar (mic, cam, share, chat, participants, leave/end)
│   │   ├── Navbar.jsx           # Responsive glassmorphic navigation header with auth user state
│   │   ├── ProtectedRoute.jsx   # Auth guard for secure routes with branded loading animation
│   │   ├── RecentMeetings.jsx   # Meeting history with loading/empty/error states & details dialog
│   │   └── VideoTile.jsx        # Video participant tile with HTML5 <video>, badges & avatar fallback
│   ├── context/
│   │   └── AuthContext.jsx  # Centralized Supabase authentication provider & hooks
│   ├── hooks/
│   │   └── useWebRTC.js     # Mesh WebRTC, screen share, chat & media synchronization hook
│   ├── layouts/
│   │   └── MainLayout.jsx   # Top-level wrapper with Navbar and Footer
│   ├── lib/
│   │   └── supabase.js      # Supabase client singleton with env validation
│   ├── pages/
│   │   ├── Home.jsx         # Landing page with hero, mock video demo, features, workflow
│   │   ├── Login.jsx        # Connected login page with email/pwd, Google SSO, and forgot password
│   │   ├── Signup.jsx       # Connected registration form with validation, metadata & email verify
│   │   ├── ResetPassword.jsx# Password recovery page for authenticated password updates
│   │   ├── Profile.jsx      # User profile and account management page with editable display name
│   │   └── MeetingRoom.jsx  # Real-time WebRTC video conference room with stage, chat & participants
│   ├── services/
│   │   ├── api.js           # REST API client with timeouts (AbortController), retry & error mapping
│   │   └── webrtc.js        # WebRTC ICE servers, media constraints & WebSocket URL helpers
│   ├── App.jsx              # Router configuration with ErrorBoundary & protected /profile route
│   ├── index.css            # Tailwind CSS configuration, design tokens & utilities
│   └── main.jsx             # React entry point with BrowserRouter
├── .env.example             # Example environment variable template
├── index.html               # Semantic HTML5 entry template with Google Fonts & metadata
├── package.json             # NPM dependencies and scripts
├── vite.config.js           # Vite configuration with React and Tailwind plugins
└── README.md                # Project documentation
```

---

## 🔒 Security & Quality Enhancements (Part 7)

1. **User Profile & Account Management (`/profile`):**
   - Editable full name with whitespace normalization and length constraints (1–100 chars).
   - Read-only email address managed securely through Supabase identity.
   - Zero exposure of internal tokens, Supabase UUIDs, or MongoDB IDs.
   - Consistent logout across navbar and profile views.
2. **Meeting History States:**
   - Dedicated Loading ("Loading your meetings..."), Empty ("You haven't joined any meetings yet."), Error ("Unable to load meeting history. Please try again." with retry), and Success states.
   - Meeting details modal providing session timestamps, room IDs, and role information with accessible ESC key handling.
3. **Unified API Error Handling:**
   - Standard 15-second `AbortController` timeout prevents indefinitely hanging network requests.
   - Safe single-retry on 401 session expiry via Supabase token refresh before user re-prompting.
   - Consistent HTTP status error mapping (401, 403, 404, 422, 429, 500, 503).
4. **WebSocket & WebRTC Stability:**
   - Clamped reconnection attempts (maximum 5) with exponential backoff.
   - Reconnect counter resets upon genuine connection stabilization.
   - Clean teardown of camera, microphone, screen tracks, and peer connections upon session exit.
5. **Accessibility & Responsive Polish:**
   - Full ARIA labels, semantic roles, and focus-visible indicators across conference controls and modals.
   - Mobile-first layouts validated from 360px up to 1440px viewport widths.

---

## 🔒 Known Mesh-Network Limitations

CloudMeet currently uses a **peer-to-peer mesh architecture** ($N-1$ outbound video streams per participant).  
- **Bandwidth & CPU:** Optimal for 2–4 participants. Each additional participant requires extra encoding and uplink bandwidth.
- **Enterprise Firewalls:** Symmetric NATs require a TURN relay server (configurable via `VITE_TURN_*`).
- *Note:* In future architecture phases, a Selective Forwarding Unit (SFU) can be introduced to scale beyond small meetings without modifying the meeting management or Supabase authentication model.

---

## ⚙️ Environment Variables

Create a `.env` file in `frontend/`:
```ini
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Backend API & WebSocket URLs
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Optional WebRTC STUN/TURN Configuration (Defaults to Google public STUN)
VITE_STUN_SERVER=stun:stun.l.google.com:19302
# VITE_TURN_SERVER=turn:turn.example.com:3478
# VITE_TURN_USERNAME=username
# VITE_TURN_CREDENTIAL=credential
```

---

## 📋 Progress & Roadmap

- **PART 1 ✅** Premium React UI
- **PART 2 ✅** Supabase Authentication
- **PART 3 ✅** FastAPI + MongoDB Backend
- **PART 4 ✅** Meeting Room Management
- **PART 5 ✅** Real-Time WebRTC Video + Audio
- **PART 6 ✅** Screen Sharing, Real-Time Chat & Synchronized Controls
- **PART 7 ✅** Security + Stability + Testing + Production Polish
- **PART 8 ⏳** Cloud Deployment

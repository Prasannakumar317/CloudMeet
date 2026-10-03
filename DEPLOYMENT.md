# CloudMeet — Cloud Deployment & Production Guide (Part 8)

This document provides the complete, authoritative operational guide for deploying **CloudMeet** to the cloud using **Vercel** for the React frontend, **Render Web Service** for the Python FastAPI + WebSocket signaling backend, **MongoDB Atlas** (`cluster0`) for data persistence, and **Supabase Auth** for identity management.

---

## 🏛️ Cloud Architecture Overview

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

### Component Roles & Boundaries

| Component | Provider / Platform | Primary Responsibilities |
|---|---|---|
| **Frontend UI** | **Vercel** | Hosts the React 19 + Vite single-page application (`dist/`). Handles client-side routing, WebRTC media rendering, local device capture (`getUserMedia`, `getDisplayMedia`), and in-call UI. |
| **Signaling & REST API** | **Render Web Service** | Hosts the Python FastAPI backend. Exposes REST endpoints (`/api/*`), validates Supabase JWTs, coordinates active participant records, and runs the native WebSocket server (`/ws/meetings/{room_id}`) for WebRTC SDP offer/answer routing, ICE candidate exchange, synchronized media states, and real-time chat. |
| **Authentication** | **Supabase Auth** | Authoritative user identity provider (Email/Password, Google OAuth, session refresh, and JWT signing). |
| **Database** | **MongoDB Atlas** | Managed `cluster0` cloud cluster. Stores user profiles (`users`), meeting room states (`meetings`), and active/historical participation records (`meeting_participants`). |
| **Media Transport** | **Browser WebRTC (P2P Mesh)** | Direct encrypted peer-to-peer audio, video, and screen-sharing data streams (SRTP/DTLS) between client browsers. |

---

## ⚙️ Environment Variables Specification

### 1. Frontend Environment Variables (`Vercel`)

These variables are defined in the Vercel Project Settings under **Environment Variables** (Production and Preview scopes). All frontend variables use the `VITE_` prefix and are safe for client-side exposure.

| Variable | Required | Description | Example Production Value |
|---|---|---|---|
| `VITE_API_URL` | **Yes** | Public HTTPS base URL of the deployed Render backend | `https://cloudmeet-api.onrender.com` |
| `VITE_WS_URL` | **Yes** | Public WSS base URL of the deployed Render WebSocket service | `wss://cloudmeet-api.onrender.com` |
| `VITE_SUPABASE_URL` | **Yes** | Supabase project API URL | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Supabase public anonymous API key | `eyJhbGciOiJIUzI1...` |
| `VITE_STUN_SERVER` | No | Public STUN server for ICE candidate discovery | `stun:stun.l.google.com:19302` |
| `VITE_TURN_SERVER` | No | Optional TURN relay server URL (for symmetric NATs) | `turn:turn.example.com:3478` |
| `VITE_TURN_USERNAME` | No | Optional TURN credentials | `cloudmeet_user` |
| `VITE_TURN_CREDENTIAL` | No | Optional TURN password | `turn_secret_pass` |

> ⚠️ **CRITICAL SECURITY RULE:** Never configure `MONGODB_URI`, `SUPABASE_SERVICE_ROLE_KEY`, or any database credentials in Vercel environment variables.

---

### 2. Backend Environment Variables (`Render Web Service`)

These variables are defined in Render Dashboard under **Environment** for the `cloudmeet-api` service.

| Variable | Required | Description | Example Production Value |
|---|---|---|---|
| `PYTHON_VERSION` | **Yes** | Python runtime version | `3.11.9` |
| `MONGODB_URI` | **Yes** | MongoDB Atlas SRV connection string with credentials | `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority` |
| `MONGODB_DATABASE` | **Yes** | Target database name | `cloudmeet` |
| `SUPABASE_URL` | **Yes** | Supabase project URL for JWT verification | `https://your-project.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | **Yes** | Supabase public anon key for token verification | `eyJhbGciOiJIUzI1...` |
| `CORS_ALLOWED_ORIGINS` | **Yes** | Comma-separated list of allowed frontend origins | `https://cloudmeet.vercel.app,http://localhost:5173` |

---

## 🚀 Step-by-Step Deployment Instructions

### Step 1: MongoDB Atlas Configuration (`cluster0`)

1. Log into your [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Select your project and navigate to **Network Access** under Security.
3. Click **Add IP Address**:
   - Because Render free/standard Web Services use dynamic egress IPs across AWS/GCP regions, add `0.0.0.0/0` (Allow Access from Anywhere) with a comment like `Render Cloud Backend`.
   - Alternatively, if using a dedicated Render outbound static IP add-on, restrict the CIDR range to those specific IPs.
4. Navigate to **Database Access**:
   - Verify that your database user has read and write privileges to the `cloudmeet` database (`readWrite@cloudmeet` or `atlasAdmin`).
5. Retrieve your connection string from **Database** -> **Connect** -> **Drivers** (Python):
   ```text
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

---

### Step 2: Render Backend Deployment (`cloudmeet-api`)

1. Log into your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Web Service**.
3. Connect your Git repository (`IotMicro` or your repository fork).
4. Configure the service settings:
   - **Name:** `cloudmeet-api`
   - **Region:** Select the region closest to your users (e.g., `Oregon (US West)` or `Frankfurt (EU Central)`).
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** `Free` (or higher)
5. Expand **Advanced**:
   - **Health Check Path:** `/api/health`
   - **Auto-Deploy:** `Yes`
6. Add the **Environment Variables**:
   - `PYTHON_VERSION`: `3.11.9`
   - `MONGODB_URI`: `<Your MongoDB Atlas cluster0 connection URI>`
   - `MONGODB_DATABASE`: `cloudmeet`
   - `SUPABASE_URL`: `https://<your-project-ref>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: `<Your Supabase anon key>`
   - `CORS_ALLOWED_ORIGINS`: `https://cloudmeet.vercel.app,http://localhost:5173` *(Update with your actual Vercel domain once generated)*
7. Click **Create Web Service**.
8. Wait for the build and deployment logs to finish.
9. Verify the backend endpoints in your browser:
   - Root: `https://<your-render-subdomain>.onrender.com/` (should return `{"message": "CloudMeet API is running"}`)
   - Health: `https://<your-render-subdomain>.onrender.com/api/health` (should return `{"status": "ok", "service": "CloudMeet API", "database": "connected"}`)
   - OpenAPI Docs: `https://<your-render-subdomain>.onrender.com/docs`

---

### Step 3: Vercel Frontend Deployment

1. Log into your [Vercel Dashboard](https://vercel.com/).
2. Click **Add New...** -> **Project**.
3. Import your Git repository.
4. Configure the project settings:
   - **Project Name:** `cloudmeet`
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click **Edit** and choose `frontend`. *(If deploying from the monorepo root, set root directory to `frontend` or rely on the root `vercel.json`)*.
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
5. Expand **Environment Variables** and add the following keys for **Production** and **Preview**:
   - `VITE_API_URL`: `https://<your-render-subdomain>.onrender.com`
   - `VITE_WS_URL`: `wss://<your-render-subdomain>.onrender.com`
   - `VITE_SUPABASE_URL`: `https://<your-project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `<Your Supabase anon public key>`
   - `VITE_STUN_SERVER`: `stun:stun.l.google.com:19302`
6. Click **Deploy**.
7. Once deployment finishes, copy your assigned Vercel URL (e.g. `https://cloudmeet.vercel.app` or `https://cloudmeet-xxx.vercel.app`).

---

### Step 4: Synchronize CORS & Supabase OAuth

1. **Update Render CORS:**
   - Return to Render -> `cloudmeet-api` -> **Environment**.
   - Update `CORS_ALLOWED_ORIGINS` to include your new Vercel production domain:
     ```text
     https://cloudmeet.vercel.app,http://localhost:5173
     ```
   - Click **Save Changes** (Render will automatically redeploy or apply the updated environment).

2. **Update Supabase URL Configuration:**
   - Open your [Supabase Dashboard](https://supabase.com/dashboard) -> Select Project.
   - Go to **Authentication** -> **URL Configuration**.
   - Set **Site URL** to your production Vercel URL:
     ```text
     https://cloudmeet.vercel.app
     ```
   - In **Redirect URLs**, add:
     ```text
     https://cloudmeet.vercel.app/**
     https://cloudmeet.vercel.app/reset-password
     http://localhost:5173/**
     ```
   - Click **Save**.

3. **Google OAuth Provider Configuration (if enabled):**
   - In Supabase Dashboard -> **Authentication** -> **Providers** -> **Google**.
   - Ensure the **Authorized redirect URI** listed by Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`) is added to your [Google Cloud Console](https://console.cloud.google.com/) OAuth 2.0 Client credentials under **Authorized redirect URIs**.

---

## 🧪 Comprehensive Cloud Testing Procedures

### 1. Direct SPA Route Navigation
Test direct browser address bar navigation and page refreshes on:
- `https://<your-vercel-domain>/`
- `https://<your-vercel-domain>/login`
- `https://<your-vercel-domain>/signup`
- `https://<your-vercel-domain>/profile`
- `https://<your-vercel-domain>/meeting/demo-room`

*Verification:* None of these routes should return a 404 from Vercel; all should resolve seamlessly through the client-side router (`vercel.json` rewrites).

### 2. End-to-End Conference & Media Verification
1. **User A (Host):**
   - Open `https://<your-vercel-domain>` in Chrome or Edge.
   - Sign in with verified account.
   - Click **Start Instant Meeting**.
   - Confirm browser camera and microphone permissions when prompted.
   - Verify local video feed renders smoothly with active mic indicator.
   - Click **Copy Meeting ID** or invite link.
2. **User B (Guest):**
   - Open the meeting URL in a separate browser window, incognito tab, or second device.
   - Sign in with a second test account.
   - Join the room.
   - Verify:
     - WebSocket connects over `wss://` without protocol errors.
     - WebRTC peer connection transitions to `connected`.
     - User A sees User B's live video and hears audio.
     - User B sees User A's live video and hears audio.
     - Participant count accurately displays `2`.
3. **Collaboration Features:**
   - **Screen Share:** Click **Share Screen** on User A. Verify User B switches to the prominent stage layout with User A's screen and participant thumbnail strip below. Stop sharing and confirm camera state returns to its previous state.
   - **Chat:** Open chat drawer. Send `"Hello CloudMeet!"`. Verify User B receives the chat message in real time with unread count badge.
   - **Participant Drawer:** Toggle participant drawer on both sides. Verify host badge and participant names.
   - **Meeting History:** Leave meeting on User B. Return to Dashboard/Profile to confirm session appears in recent meeting history.

---

## 🔒 Production Security Verification

- [x] **Zero Hardcoded Secrets:** No database connection strings, Supabase service-role keys, or JWT tokens are committed to source files.
- [x] **Secure Protocols:** All public communication is strictly encrypted over `https://` and `wss://`.
- [x] **Restricted CORS:** Backend permits requests only from the configured Vercel production origin and local development.
- [x] **Server-Authoritative Identity:** Client-side display names and participant IDs are validated and authenticated against Supabase JWT tokens.
- [x] **Masked Errors:** 500 internal server exceptions return clean, sanitized messages to clients while logging full traces server-side.
- [x] **Input Validation:** Strict room code validation (`[A-Z0-9]{4,20}`), message length restrictions (2000 chars), and display name bounds (1–100 chars).
- [x] **XSS Prevention:** Zero usage of `dangerouslySetInnerHTML`; all chat and participant text renders safely as text nodes.

---

## ⚠️ Known Architecture Limitations

1. **P2P Mesh Topology:** CloudMeet utilizes a browser-native WebRTC mesh topology ($N-1$ upstream video tracks per peer). This design is lightweight, requires no dedicated media server, and is ideal for micro-projects and small meetings (2–4 participants). Scaling to 10+ participants would require a Selective Forwarding Unit (SFU) media server (e.g., LiveKit or Mediasoup).
2. **Restrictive Corporate Firewalls (Symmetric NAT):** WebRTC media streams connect directly between browsers using Google's public STUN server. Users behind strict corporate firewalls or carrier-grade symmetric NATs may require a TURN relay server configured in `VITE_TURN_SERVER`.
3. **Signaling State Isolation:** WebSocket signaling and participant states are stored in process memory on the Render Web Service instance. This is optimal for single-instance cloud hosting. Horizontal auto-scaling to multiple backend instances would require a shared pub/sub layer (e.g., Redis).

---

## 🔄 Exact Steps for Future Redeployments

1. **Frontend Updates:**
   - Commit and push changes to the `main` branch.
   - Vercel automatically detects changes in `frontend/`, executes `npm run build`, and updates the production deployment with zero downtime.
2. **Backend Updates:**
   - Commit and push changes to `backend/`.
   - Render automatically triggers a new build, installs dependencies from `requirements.txt`, launches the updated Uvicorn service, and verifies `/api/health` before routing traffic.

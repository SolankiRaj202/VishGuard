# 🛡️ VishGuard — AI-Powered Call Threat Detector

> **Real-time voice phishing (vishing) and scam detection powered by Google Gemini AI.**

VishGuard actively monitors phone calls using your device's browser, transcribes speech in real time, and uses **Google Gemini 2.5 Flash Lite** to detect social engineering threats, urgency tactics, and requests for sensitive information — completely free, with no paid subscriptions required.

---

## ✨ Features

### 🎙️ Live Call Monitoring
- Uses the browser-native **Web Speech API** (`SpeechRecognition`) for zero-latency, on-device transcription — no audio ever leaves your browser until analysis.
- Works on **Chrome (Android)** and **Safari (iOS)** out of the box.
- Auto-restarts the recognition session after silence or interruption (handles Android Chrome's session-end behaviour).
- **Screen Wake Lock API** prevents the mobile screen from sleeping, ensuring 30+ minute calls are fully captured without data loss.
- Threat analysis fires **every 20 seconds** while monitoring is active, keeping the threat score continuously up to date.

### 📁 Audio File Upload & Analysis
- Upload a recorded call in **MP3, MP4, WAV, WebM, OGG, M4A, FLAC, or AAC** format.
- The backend sends the audio directly to Gemini, which simultaneously **transcribes** and **threat-scores** the recording in one pass.
- Full transcript and threat assessment are displayed side-by-side.

### 🎨 Monochromatic Console UI
- Enterprise-grade grayscale design — only the threat indicators (🟢 Green / 🟡 Amber / 🔴 Red) draw attention.
- Touch-optimised layouts with 44 px tap targets and iOS safe-area padding for modern phone screens.
- Live interim speech text, session duration timer, segment counter, and backend connectivity status are all surfaced in real time.

### ⚙️ Advanced Backend
| Feature | Detail |
|---|---|
| **AI Model** | `gemini-2.5-flash-lite` with all safety filters set to `BLOCK_NONE` to allow analysis of sensitive vishing transcripts |
| **API Key Pool** | Supports an unlimited number of Gemini API keys, comma-separated in `.env` |
| **Key Rotation** | Automatically rotates to the next key on a Google hard-quota `429` error |
| **Daily Cap** | Each key is hard-capped at **19 requests/day** (configurable via `DAILY_LIMIT`) to prevent surprise billing |
| **Quota Persistence** | Usage counters are stored in `usage.json` (keyed by index, never by key string) and reset automatically each calendar day |
| **Admin Dashboard** | `GET /admin-tracker` — a live progress-bar UI showing usage health for every configured key |
| **503 Retry** | Single automatic retry with 1.5 s backoff on Gemini service unavailability |

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐      ┌──────────────────────────────────────┐
│         Browser / Mobile        │      │           Node.js Backend             │
│                                 │      │                                        │
│  Web Speech API (on-device SR)  │      │  POST /analyze        ← live text     │
│         ↓ final segments        │ HTTP │  POST /analyze-audio  ← audio file    │
│  React + Vite frontend  ────────┼─────►│  POST /transcribe     ← audio chunk   │
│                                 │      │  GET  /health                          │
│  Screen Wake Lock API           │      │  GET  /admin-tracker                  │
│  (prevents sleep on mobile)     │      │         ↓                              │
└─────────────────────────────────┘      │  Google Gemini 2.5 Flash Lite API     │
                                         └──────────────────────────────────────┘
```

### Frontend (React + Vite)
- Hosted on **GitHub Pages** (free).
- Deployed automatically on every push to `main`/`master` via `.github/workflows/deploy.yml`.
- Reads `VITE_BACKEND_URL` at build time (injected from a GitHub Actions secret).
- Base path is `/VishGuard/` — configured in `vite.config.js`.

### Backend (Node.js + Express)
- Hosted on **Render** (free tier).
- Auto-deployed via `render.yaml` (zero-config).
- Binds to `0.0.0.0` so phones on the same Wi-Fi network can reach it using the laptop's LAN IP during local development.
- No database required — `usage.json` serves as the lightweight persistence layer.

---

## 🔌 API Reference

| Method | Endpoint | Body / Params | Description |
|--------|----------|---------------|-------------|
| `GET` | `/health` | — | Returns `{ "status": "ok" }`. Used for backend connectivity checks. |
| `GET` | `/admin-tracker` | — | HTML dashboard showing daily quota usage for all configured API keys. |
| `POST` | `/analyze` | `{ transcript: string }` | Analyzes a live call transcript. Returns threat JSON. |
| `POST` | `/analyze-audio` | `multipart/form-data` — field `audio` | Transcribes **and** analyzes an uploaded audio file in one Gemini call. |
| `POST` | `/transcribe` | `multipart/form-data` — field `audio` | Transcribes a raw audio chunk (text only, no threat scoring). |

### Threat Analysis Response Shape
```json
{
  "score": 82,
  "category": "Vishing Attempt",
  "flaggedPhrases": ["your account will be suspended", "verify your OTP now"],
  "reasoning": "The caller impersonates a bank and requests an OTP under threat of account closure — a classic vishing pattern."
}
```

**Score thresholds:**
- `0–29` → **Safe** (green)
- `30–69` → **Suspicious / Spam** (amber)
- `70–100` → **Vishing / High Risk** (red) — triggers the alert banner

---

## 💻 Local Development

### Prerequisites
- Node.js 18+
- A free [Google AI Studio](https://aistudio.google.com/) account for Gemini API keys

### 1. Clone & set up the backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
# Comma-separated Gemini API keys (1 or more)
API_KEYS=AIza...,AIza...
PORT=4000
```

> **Tip:** The key variable also accepts the aliases `GEMINI_API_KEYS` or `GEMINI_API_KEY` for backwards compatibility.

Start the backend:

```bash
node server.js
# or for auto-reload during development:
npx nodemon server.js
```

The terminal will print your local and LAN addresses:
```
🚀 VishGuard Backend running
   Local:   http://localhost:4000
   Network: http://192.168.x.x:4000  ←  use this URL on your phone
   Health:  http://192.168.x.x:4000/health

📱 Mobile setup: set VITE_BACKEND_URL=http://192.168.x.x:4000 in frontend/.env
```

### 2. Set up the frontend

Open a new terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
# For desktop-only testing:
VITE_BACKEND_URL=http://localhost:4000

# For mobile testing on the same Wi-Fi:
# VITE_BACKEND_URL=http://192.168.x.x:4000
```

Start the dev server:

```bash
npm run dev
```

The React app will be live at `http://localhost:5173`.

---

## 🚀 Deployment

### Backend → Render (free)

1. Push the repo to GitHub.
2. Connect it to [Render](https://render.com). The `render.yaml` file auto-configures everything.
3. In the Render dashboard, go to **Environment → Environment Variables** and add:
   - `API_KEYS` = your comma-separated Gemini API keys
4. Deploy. Render will assign you a public URL like `https://vishguard-backend.onrender.com`.

### Frontend → GitHub Pages

1. In your GitHub repo, go to **Settings → Secrets and variables → Actions**.
2. Add a repository secret: `VITE_BACKEND_URL` = your Render backend URL.
3. Enable **GitHub Pages** (Settings → Pages → Source: **GitHub Actions**).
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys automatically.

Your live site will be at: `https://<your-username>.github.io/VishGuard/`

---

## 📱 Using VishGuard on Mobile

1. Open the live GitHub Pages URL on your phone.
2. Tap the **🎙️ Live Monitoring** tab.
3. Tap **▶ Start Monitoring** and grant microphone permission when prompted.
4. Put the phone on **speakerphone** next to the suspected scam call.
5. VishGuard will transcribe the conversation and update the threat meter every 20 seconds in real time.

> **Browser compatibility:** Use **Chrome** on Android or **Safari** on iOS. Other mobile browsers may not support the Web Speech API.

---

## 📂 Project Structure

```
VishGuard/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions: build & deploy frontend to Pages
├── backend/
│   ├── server.js               # Express server: all API routes + key rotation logic
│   ├── package.json
│   ├── usage.json              # Auto-generated: daily API key usage counters
│   ├── check_models.js         # Utility: list available Gemini models
│   ├── test_ai.js              # Smoke test: basic AI connectivity
│   ├── test_safe.js            # Test: safe transcript analysis
│   ├── test_unsafe.js          # Test: high-risk transcript detection
│   └── test_all.js             # Combined test runner
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Root component: state, tabs, monitoring logic
│   │   ├── index.css           # Global styles & design system tokens
│   │   ├── main.jsx            # React entry point
│   │   ├── components/
│   │   │   ├── AlertBanner.jsx     # High-threat dismissable alert
│   │   │   ├── AnalysisSummary.jsx # AI reasoning + flagged phrases display
│   │   │   ├── AudioUpload.jsx     # Drag/click file upload with state UI
│   │   │   ├── ThreatBadge.jsx     # Colour-coded category pill
│   │   │   ├── ThreatMeter.jsx     # Score bar + category display
│   │   │   └── TranscriptPanel.jsx # Live rolling transcript with phrase highlights
│   │   └── hooks/
│   │       └── useSpeechRecognition.js  # Mobile-safe Web Speech API hook
│   ├── vite.config.js          # Vite config (base path for GitHub Pages)
│   ├── index.html
│   └── package.json
├── render.yaml                 # Render.com auto-deploy config
└── README.md
```

---

## 🔐 Security Notes

- API keys are **never written to disk by key string** — `usage.json` stores counts by positional index (`key_0`, `key_1`, …) only.
- The `VITE_BACKEND_URL` secret is injected at CI build time; it is not committed to the repository.
- The admin dashboard at `/admin-tracker` shows only masked key prefixes/suffixes — not full key values.
- CORS is set to `*` for maximum compatibility with mobile browsers and GitHub Pages. For production hardening, replace `'*'` with your specific GitHub Pages origin.

---

## 📄 License

MIT — free to use, modify, and distribute.

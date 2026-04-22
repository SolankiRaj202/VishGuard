# VishGuard — Backend

Express API server that handles AI-powered threat analysis for the VishGuard frontend.

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.3 | HTTP server & routing |
| @google/generative-ai | ^0.24.1 | Cloud AI client |
| multer | ^1.4.5-lts.1 | Multipart audio file uploads |
| cors | ^2.8.5 | Cross-origin request headers |
| dotenv | ^16.4.5 | `.env` file loader |
| nodemon | ^3.1.3 (dev) | Auto-reload during development |

## Quick Start

```bash
npm install
```

Create a `.env` file:

```env
# One or more AI API keys, comma-separated.
# Aliases: GEMINI_API_KEYS or GEMINI_API_KEY also work.
API_KEYS=AIza...,AIza...

PORT=4000
```

Run the server:

```bash
node server.js           # production
npx nodemon server.js    # development (auto-reload)
```

On startup the server prints local, LAN, and health URLs, plus the exact `VITE_BACKEND_URL` env value needed for the frontend.

---

## API Endpoints

### `GET /health`
Liveness check. Returns `{ "status": "ok" }`.

### `GET /admin-tracker`
HTML dashboard showing daily quota usage for every configured API key.
- Masked key string (first 8 + last 4 characters)
- Progress bar showing `count / 19` daily requests used
- Active / Standby / Exhausted status badge

### `POST /analyze`
Analyzes a text transcript for vishing threats.

**Request body (JSON):**
```json
{ "transcript": "Hi, this is Amazon calling about your account..." }
```

**Response:**
```json
{
  "score": 78,
  "category": "Vishing Attempt",
  "flaggedPhrases": ["verify your identity", "act within 24 hours"],
  "reasoning": "The caller impersonates Amazon and creates urgency to extract personal information."
}
```

Score thresholds: `0–29` Safe · `30–69` Suspicious · `70–100` High Risk

### `POST /analyze-audio`
Transcribes **and** threat-analyzes an uploaded audio file in a single AI call.

**Request:** `multipart/form-data` with field `audio` (MP3, MP4, WAV, WebM, OGG, M4A, FLAC, AAC).

**Response:** Same shape as `/analyze`, plus a `transcript` field containing the full transcription.

### `POST /transcribe`
Transcribes a raw audio chunk (text only — no threat scoring).

**Request:** `multipart/form-data` with field `audio`.

**Response:**
```json
{ "transcript": "Hello, I am calling from your bank..." }
```

---

## API Key Management

### Rotation Logic
1. On startup, `usage.json` is loaded and per-key counters are initialized (reset if the date has changed).
2. Before each AI call, `ensureValidKey()` scans keys in order; if the current key's count meets `DAILY_LIMIT` it advances `currentKeyIndex`.
3. If a live call returns a `429` (Google hard quota), the key's count is maxed out and the next key is tried immediately.
4. If a live call returns a `503`, a single 1.5 s backoff retry is attempted before propagating the error.
5. If all keys are exhausted, a `500` error is returned with a descriptive message.

### `usage.json` schema
```json
{
  "key_0": { "count": 12, "date": "Wed Apr 23 2026" },
  "key_1": { "count":  0, "date": "Wed Apr 23 2026" }
}
```
Keys are stored by **positional index only** — never by their actual string value.

### Changing the daily cap
Edit `DAILY_LIMIT` at the top of `server.js` (default: `19`).

---

## AI Engine

The backend uses **`gemini-2.5-flash-lite`** with all safety filter thresholds set to `BLOCK_NONE`. This is necessary because vishing transcripts naturally contain language that would otherwise trigger content filters (threats, urgency, sensitive data requests).

---

## Test Scripts

| Script | Purpose |
|--------|---------|
| `node test_ai.js` | Basic AI connectivity smoke test |
| `node test_safe.js` | Send a benign transcript and assert a low score |
| `node test_unsafe.js` | Send a vishing transcript and assert a high score |
| `node test_all.js` | Run all three tests in sequence |
| `node check_models.js` | List all AI models accessible with your first key |

---

## Deployment on Render

The `render.yaml` at the repo root configures Render auto-deployment:

```yaml
services:
  - type: web
    name: vishguard-backend
    plan: free
    runtime: node
    rootDir: backend
    buildCommand: npm install
    startCommand: node server.js
```

Set the `API_KEYS` environment variable in the Render dashboard under **Environment → Environment Variables**. Do **not** commit keys to the repository.

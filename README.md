# VishGuard — Real-Time AI Call Spam & Phishing Detection System

## Quick Start

### Step 1: Configure API Keys

```powershell
cd c:\Users\rysol\Downloads\vo\backend
copy .env.example .env
notepad .env
```

Add your keys in `.env`:
```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
PORT=4000
```

### Step 2: Start the Backend

```powershell
cd c:\Users\rysol\Downloads\vo\backend
node server.js
```

You should see:
```
🚀 Vishing Detector Backend running on http://localhost:4000
```

### Step 3: Start the Frontend (new terminal)

```powershell
cd c:\Users\rysol\Downloads\vo\frontend
npm run dev
```

Open: **http://localhost:5173**

---

## Usage

1. Open **http://localhost:5173** in **Chrome** or **Edge**
2. Click **▶ Start Monitoring**
3. Allow microphone access when prompted
4. Put your phone on **speakerphone** near the laptop
5. Watch the live transcript and threat meter update in real time!

---

## Project Structure

```
vo/
├── backend/
│   ├── server.js          ← Express + Socket.io + Whisper + Gemini
│   ├── package.json
│   ├── .env               ← Your API keys (create from .env.example)
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx                    ← Main dashboard
    │   ├── index.css                  ← Premium dark UI
    │   ├── components/
    │   │   ├── ThreatMeter.jsx        ← Animated threat bar
    │   │   ├── ThreatBadge.jsx        ← Safe/Suspicious/High Risk badge
    │   │   ├── AlertBanner.jsx        ← High-risk alert popup
    │   │   ├── TranscriptPanel.jsx    ← Live transcript with highlights
    │   │   └── AnalysisSummary.jsx    ← AI reasoning + flagged phrases
    │   └── hooks/
    │       └── useAudioCapture.js     ← MediaRecorder mic capture
    └── index.html
```

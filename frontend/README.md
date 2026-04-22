# VishGuard — Frontend

This is the React + Vite frontend for **VishGuard**, a real-time AI-powered call threat detector.

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| React | ^18.3.1 | UI framework |
| Vite | ^5.4.2 | Build tool & dev server |
| @vitejs/plugin-react | ^4.3.1 | JSX transform (Babel) |

## Quick Start

```bash
npm install
npm run dev        # Dev server at http://localhost:5173
npm run build      # Production build → ./dist/
npm run preview    # Preview production build locally
```

## Environment Variables

Create a `.env.local` file in this directory:

```env
# Backend API URL — defaults to localhost:4000 if not set
VITE_BACKEND_URL=http://localhost:4000
```

For mobile testing on the same Wi-Fi network, replace `localhost` with your machine's LAN IP address (printed by the backend on startup).

## Source Layout

```
src/
├── App.jsx                      # Root: tabs, state, recording & analysis logic
├── index.css                    # Global design system (tokens, layout, components)
├── main.jsx                     # React DOM entry point
├── components/
│   ├── AlertBanner.jsx          # Dismissable high-threat alert strip
│   ├── AnalysisSummary.jsx      # AI reasoning text + flagged phrases list
│   ├── AudioUpload.jsx          # Click-to-upload audio file UI (8 formats)
│   ├── ThreatBadge.jsx          # Colour-coded category pill (Safe/Suspicious/…)
│   ├── ThreatMeter.jsx          # Threat score bar with 0–100 scale
│   └── TranscriptPanel.jsx      # Rolling transcript with highlighted phrases
└── hooks/
    └── useSpeechRecognition.js  # Mobile-safe Web Speech API hook
```

## Key Design Decisions

### `useSpeechRecognition` hook
The hook wraps the browser's `SpeechRecognition` / `webkitSpeechRecognition` API and handles all edge cases needed for mobile:
- Auto-restarts after Android Chrome's natural session end
- Silent recovery from `no-speech`, `network`, and `audio-capture` errors
- Hard stop + user notification on `not-allowed` (mic denied)
- Re-starts when the page becomes visible again after a screen lock

### Screen Wake Lock
`App.jsx` acquires a `navigator.wakeLock` screen lock when monitoring starts and releases it on stop/unmount. If the page becomes hidden and then visible again, the lock is re-acquired — preventing the mobile OS from hibernating mid-call.

### Analysis Interval
Live threat analysis runs every **20 seconds** (`ANALYSIS_INTERVAL_MS = 20000`) via `setInterval`. A first-pass analysis also fires 500 ms after the very first transcript segment arrives, so results appear quickly without waiting a full interval.

## Deployment

The frontend is deployed to **GitHub Pages** via `.github/workflows/deploy.yml`.

- The Vite `base` is set to `/VishGuard/` in `vite.config.js` — this must match your GitHub repository name.
- The `VITE_BACKEND_URL` GitHub Actions secret is injected at build time.
- Any push to `main` or `master` triggers a build and deploy automatically.

# VishGuard — Project Introduction

## What is VishGuard?

**VishGuard** is a free, open-source, real-time call threat detection system designed to protect individuals from **voice phishing (vishing)** — a form of social engineering where attackers impersonate trusted organisations (banks, government agencies, tech support) over the phone to steal sensitive information.

VishGuard runs entirely in a web browser. It listens to your phone call in real time, transcribes the conversation on-device, and uses Google's Gemini AI to continuously score the call for threat indicators — all without requiring any app installation, subscription, or paid plan.

---

## The Problem

Vishing (voice phishing) is one of the fastest-growing forms of cybercrime worldwide:

- Attackers impersonate banks, government agencies (IRS, HMRC, police), tech companies (Amazon, Microsoft, Apple), and utility providers.
- They exploit **urgency** ("your account will be suspended in 24 hours"), **fear** ("police will arrest you"), and **authority** to pressure victims into revealing OTPs, PINs, bank account details, or installing remote-access software.
- Victims frequently cannot tell in real time that they are being manipulated — the conversation feels plausible, and the psychological pressure prevents rational decision-making.
- Existing spam call blockers only flag the calling number; they cannot analyse the *content* of the conversation.

**There is no widely available, free, real-time tool that listens to a live call and raises an alert when a scam pattern is detected.**

VishGuard was built to fill this gap.

---

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                      User's Phone / Browser                       │
│                                                                    │
│  Phone call on speakerphone  →  Browser microphone picks up audio │
│                                        ↓                           │
│             Web Speech API (on-device speech recognition)          │
│                                        ↓                           │
│              Live transcript built up segment by segment           │
│                                        ↓                           │
│          Every 20 seconds: transcript sent to backend              │
└──────────────────────────────────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     VishGuard Backend (Node.js)                    │
│                                                                    │
│   Google Gemini 2.5 Flash Lite analyses transcript for:            │
│    • Impersonation of trusted organisations                        │
│    • Urgency / fear / authority pressure tactics                   │
│    • Requests for OTP, PIN, account numbers, passwords             │
│    • Lottery / prize scams                                         │
│    • Remote access software requests                               │
│                                                                    │
│   Returns: threat score (0–100), category, flagged phrases,        │
│            and a plain-English reasoning summary                    │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   VishGuard UI (React frontend)                    │
│                                                                    │
│   🟢 Safe (0–29)   →  Low-key display, monitoring continues       │
│   🟡 Suspicious (30–69)  →  Amber alert, flagged phrases shown    │
│   🔴 High Risk (70–100)  →  Red banner, immediate user warning    │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Choices

| Choice | Rationale |
|--------|-----------|
| **Browser Web Speech API** for transcription | Zero latency, on-device, no audio upload required, works on Android Chrome & iOS Safari |
| **Screen Wake Lock API** | Prevents mobile OS from sleeping mid-call, ensuring long calls (30+ min) are fully captured |
| **Gemini 2.5 Flash Lite** | Free-tier API, low latency, strong reasoning on conversational text, multimodal (handles audio file uploads too) |
| **API key pool with rotation** | Allows the free-tier daily quota to scale linearly with the number of keys configured — no paid tier needed |
| **GitHub Pages + Render free tier** | Zero ongoing hosting cost |
| **No database** | `usage.json` is the only persistence layer — no setup overhead |

---

## Who is This For?

- **Individuals** who receive frequent suspicious calls and want a second opinion in real time.
- **Elderly users** who may be more vulnerable to social engineering — a family member can set this up on a tablet and leave it running.
- **Security researchers and students** studying NLP-based threat detection and social engineering patterns.
- **Academic projects** exploring the intersection of speech recognition, large language models, and real-time cybersecurity.

---

## Threat Categories

VishGuard classifies calls into six categories:

| Category | Score Range | Description |
|----------|-------------|-------------|
| **Safe** | 0–29 | Normal conversation, no red flags detected |
| **Spam** | 30–49 | Unsolicited commercial call; low threat |
| **Suspicious** | 40–59 | Possible scripted pitch or soft pressure tactics |
| **Vishing Attempt** | 60–74 | Clear social engineering pattern detected |
| **Social Engineering** | 70–84 | Multiple manipulation tactics identified |
| **High Risk** | 85–100 | Imminent threat — caller requesting sensitive data under pressure |

---

## Limitations & Ethical Notes

- VishGuard requires the **call to be on speakerphone** so the browser microphone can pick up both sides of the conversation. It does not integrate with telephony APIs.
- Analysis accuracy depends on transcript quality. Background noise or accented speech may reduce transcription fidelity.
- VishGuard is an **advisory tool** — its AI assessments should inform, not replace, human judgement.
- All audio processing (transcription) happens **on-device** in the browser; only the text transcript is sent to the backend for AI analysis.
- This tool is intended for **defensive, personal use** only. Recording phone calls may be subject to legal requirements in your jurisdiction — always obtain consent where required.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 18 + Vite 5 |
| Styling | Vanilla CSS (custom design system) |
| Speech recognition | Web Speech API (`SpeechRecognition`) |
| Screen sleep prevention | Screen Wake Lock API |
| Backend runtime | Node.js + Express 4 |
| AI model | Google Gemini 2.5 Flash Lite |
| AI client | `@google/generative-ai` SDK |
| Audio upload handling | Multer |
| Frontend hosting | GitHub Pages (free) |
| Backend hosting | Render (free tier) |
| CI/CD | GitHub Actions |

---

## Project Status

VishGuard is **fully functional** and actively maintained. Current capabilities:

- ✅ Real-time live call monitoring (desktop + mobile)
- ✅ Audio file upload analysis (transcription + threat scoring)
- ✅ API key pool management with automatic rotation and daily cap enforcement
- ✅ Mobile-optimised UI with wake lock and touch-friendly design
- ✅ Admin API quota dashboard
- ✅ Continuous deployment via GitHub Actions + Render

---

*Built as part of an academic project exploring real-time AI-assisted cybersecurity tools.*

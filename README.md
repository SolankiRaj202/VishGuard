# VishGuard — AI-Powered Call Threat Detector

VishGuard is a real-time voice phishing (vishing) and scam detection system. It actively monitors phone calls, transcribes the audio, and uses Google's **Gemini AI** to detect social engineering threats, urgency tactics, and requests for sensitive information.

## 🌟 Features

- **Live Monitoring:** Uses robust `MediaRecorder` audio chunking (every 20 seconds) to transcribe and analyze live conversations. Flawlessly supports mobile devices (iOS and Android).
- **Audio File Upload:** Upload `.mp3`, `.wav`, or `.m4a` recordings of suspicious calls for an instant full-text transcription and threat assessment.
- **AI Threat Analysis:** Evaluates the transcript to provide a Threat Score (0-100), Category (e.g., "Vishing Attempt", "Safe"), and highlights specific suspicious phrases.
- **Mobile-Ready UI:** Premium dark-mode dashboard built with React and Vite.

## 🚀 Architecture & Deployment

The system is split into a frontend and backend, both configured for free continuous deployment.

### Backend (Node.js + Express)
- Hosted on **Render** (free tier).
- Receives audio chunks via the `/transcribe` and `/analyze-audio` endpoints.
- Processes audio directly through the `gemini-2.5-flash` multimodal AI model.
- Automatically deployed via `render.yaml`.

### Frontend (React + Vite)
- Hosted on **GitHub Pages**.
- Automatically built and deployed via GitHub Actions (`.github/workflows/deploy.yml`).
- Uses environment variables (`VITE_BACKEND_URL`) to connect to the Render backend.

---

## 💻 Local Development Setup

If you want to run VishGuard locally on your own machine:

### 1. Start the Backend
```bash
cd backend
npm install
```
Create a `.env` file inside the `backend` folder and add your Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=4000
```
Run the server:
```bash
node server.js
```
*The backend will be live at `http://localhost:4000`*

### 2. Start the Frontend
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
*The React app will be live at `http://localhost:5173`*

## 📱 How to Use on Mobile
When accessing the live GitHub Pages site on your phone:
1. Tap the **Live Monitoring** tab.
2. Press **Start Monitoring**.
3. Accept the browser's microphone permissions.
4. Put your phone on speakerphone next to the suspected scam call, and VishGuard will update its threat meter in real-time as the call progresses!

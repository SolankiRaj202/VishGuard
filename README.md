# VishGuard — AI-Powered Call Threat Detector

VishGuard is a real-time voice phishing (vishing) and scam detection system. It actively monitors phone calls, transcribes the audio, and uses a **Cloud Multimodal AI** to detect social engineering threats, urgency tactics, and requests for sensitive information. 

## 🌟 Features

- **Live Monitoring:** Uses robust `MediaRecorder` audio chunking (every 20 seconds) to transcribe and analyze live conversations. Flawlessly supports mobile devices (iOS and Android).
- **Audio File Upload:** Upload `.mp3`, `.wav`, or `.m4a` recordings of suspicious calls for an instant full-text transcription and threat assessment.
- **Enterprise Monochromatic UI:** A razor-sharp, distraction-free grayscale console where only the threat indicators (Red, Amber, Green) grab attention.
- **Advanced Backend Architecture:** 
  - **API Key Failover Rotation:** Seamlessly rotates through an unlimited pool of AI API keys.
  - **Hard-Capped Quota Tracking:** Stops an API key from exceeding 19 requests per day to prevent surprise billing quotas organically.
  - **Hidden Admin Dashboard:** Access `/admin-tracker` on the backend to view live progress bar usages of all API keys via a file-synced database (`usage.json`).

## 🚀 Architecture & Deployment

The system is split into a frontend and backend, both configured for free continuous deployment.

### Backend (Node.js + Express)
- Hosted on **Render** (free tier).
- Processes audio directly through an advanced multimodal AI model.
- Includes the hidden `GET /admin-tracker` UI dashboard visualizing daily request health.
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
Create a `.env` file inside the `backend` folder and add your AI API keys (comma-separated):
```env
# Support 1 to 5+ API keys by separating via comma
API_KEYS=key1_string_here,key2_string_here,key3_string_here
PORT=4000
```
Run the server:
```bash
node server.js
```
*The backend will be live at `http://localhost:4000`*
*(View the API tracker at `http://localhost:4000/admin-tracker`)*

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

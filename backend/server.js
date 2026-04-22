require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');


const app = express();
const server = http.createServer(app);

// Allow all origins in production (GitHub Pages, mobile browsers, etc.)
// For tighter security, replace '*' with your GitHub Pages URL after deployment.
app.use(cors({ origin: '*' }));
app.use(express.json());

// Multer for audio file uploads
const upload = multer({ dest: os.tmpdir() });

// ─── API Key Management & Rotation ──────────────────────────────────────────
const apiKeys = (process.env.API_KEYS || process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k);

if (apiKeys.length === 0) {
  console.warn('⚠️ No GEMINI_API_KEYS found in environment variables.');
}

let currentKeyIndex = 0;
const DAILY_LIMIT = 19;
const USAGE_FILE = path.join(__dirname, 'usage.json');
let keyUsage = [];

function initializeUsage() {
  const today = new Date().toDateString();
  let fileData = {};
  try {
    if (fs.existsSync(USAGE_FILE)) {
      fileData = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading usage.json:', err);
  }

  // Store by index (key_0, key_1...) — NEVER by actual key string, preventing key exposure
  keyUsage = apiKeys.map((_, i) => {
    const defaultData = { count: 0, date: today };
    const saved = fileData[`key_${i}`];
    if (saved && saved.date === today) {
      return saved;
    }
    return defaultData;
  });

  saveUsage();
}

function saveUsage() {
  const data = {};
  // Use positional index labels — no API key strings ever written to disk
  keyUsage.forEach((usage, i) => {
    data[`key_${i}`] = usage;
  });
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving usage.json:', err);
  }
}


// Call initialization on startup
initializeUsage();

function getActiveModel() {
  const key = apiKeys[currentKeyIndex];
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash-lite',
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
    ]
  });
}

function ensureValidKey() {
  let attempts = 0;
  while (attempts < apiKeys.length) {
    const usage = keyUsage[currentKeyIndex];
    const today = new Date().toDateString();

    // Reset limit if a new day has started
    if (usage.date !== today) {
      usage.count = 0;
      usage.date = today;
      saveUsage();
    }

    if (usage.count < DAILY_LIMIT) {
      return true; // We found a valid key under the request limit
    }

    console.warn(`[API Key Rotation] Key index ${currentKeyIndex} reached custom daily limit (${DAILY_LIMIT}). Rotating...`);
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    attempts++;
  }
  return false;
}

async function executeWithKeyRotation(generateFn) {
  if (apiKeys.length === 0) throw new Error('No API keys configured');

  let attempts = 0;
  while (attempts < apiKeys.length) {
    if (!ensureValidKey()) {
      throw new Error(`All configured API keys have exceeded their custom daily quota of ${DAILY_LIMIT} requests.`);
    }

    try {
      const model = getActiveModel();
      keyUsage[currentKeyIndex].count++; // Optimistically increment usage limit
      saveUsage(); // persist increment across instances

      return await generateFn(model);
    } catch (err) {
      if (err.status === 503) {
        console.warn(`[API] 503 Service Unavailable. Retrying immediately out of rotate loop...`);
        // We will just do a tiny backoff and retry the same active key once
        await new Promise(r => setTimeout(r, 1500));
        try {
          return await generateFn(model);
        } catch (retryErr) {
          keyUsage[currentKeyIndex].count--;
          saveUsage();
          throw retryErr;
        }
      }

      const isQuotaError = err.status === 429 || (err.message && err.message.toLowerCase().includes('quota'));
      if (isQuotaError) {
        console.warn(`[API Key Rotation] Key index ${currentKeyIndex} hit Google hard quota/429. Rotating to next key...`);
        // Max out its local limit so we don't try it again until tomorrow
        keyUsage[currentKeyIndex].count = DAILY_LIMIT;
        saveUsage();
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        attempts++;
      } else {
        // Not a quota error, subtract the usage since request didn't go through properly
        keyUsage[currentKeyIndex].count--;
        saveUsage();
        throw err;
      }
    }
  }
  throw new Error('All configured API keys have exceeded their quota.');
}

// ─── Helper: build threat-analysis prompt ────────────────────────────────────
function buildAnalysisPrompt(transcript) {
  return `
You are an expert at detecting phone scams, vishing (voice phishing), and social engineering attacks.

Analyze the following phone call transcript and return a JSON response ONLY (no markdown, no extra text):

{
  "score": <integer 0-100, threat probability>,
  "category": <"Safe" | "Spam" | "Suspicious" | "Vishing Attempt" | "Social Engineering" | "High Risk">,
  "flaggedPhrases": [<list of exact quoted phrases from the transcript that are suspicious, max 5>],
  "reasoning": <1-2 sentence plain-English explanation of your assessment>
}

Common threat indicators:
- Requests for OTP, PIN, passwords, bank details, card numbers, account numbers
- Urgency or fear tactics ("your account will be closed", "police will arrest you", "act now")
- Impersonation of banks, government agencies, tech support, IRS, Amazon, Microsoft
- Prize or lottery claims ("you have won", "claim your reward", "gift card")
- Threats, pressure tactics, unsolicited requests for personal info
- Asking to install software or remote desktop apps

TRANSCRIPT:
"""
${transcript}
"""

Respond with valid JSON only — no markdown fences, no extra text.`;
}

// ─── Helper: parse AI JSON response ──────────────────────────────────────────
function parseAIResponse(text) {
  const jsonString = text
    .replace(/<think>[\s\S]*?<\/think>/i, '') // Remove <think>...</think> blocks
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    throw new Error('AI returned non-JSON: ' + text.slice(0, 200));
  }
}

// ─── Helper: resolve MIME type from multer file ───────────────────────────────
function resolveMimeType(file, fallback) {
  const mt = file.mimetype || ''
  if (mt && mt !== 'application/octet-stream') return mt
  // Infer from original filename extension as last resort
  const ext = (file.originalname || '').split('.').pop().toLowerCase()
  const map = {
    webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/mp4', mp3: 'audio/mpeg',
    wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac'
  }
  return map[ext] || fallback
}

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── ADMIN DASHBOARD: API Tracker ───────────────────────────────────────────
app.get('/admin-tracker', (req, res) => {
  let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>API Tracker Dashboard</title>
      <style>
        :root {
          --bg-color: #0f172a;
          --panel-bg: #1e293b;
          --text-main: #f8fafc;
          --accent: #6366f1;
        }
        body {
          font-family: 'Segoe UI', system-ui, sans-serif;
          background: var(--bg-color);
          color: var(--text-main);
          margin: 0;
          padding: 2rem;
          display: flex;
          justify-content: center;
        }
        .container {
          width: 100%;
          max-width: 800px;
        }
        h1 {
          color: #818cf8;
          border-bottom: 2px solid #334155;
          padding-bottom: 10px;
        }
        .key-card {
          background: var(--panel-bg);
          padding: 20px;
          border-radius: 12px;
          margin-bottom: 20px;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        .key-name {
          font-family: monospace;
          background: #0f172a;
          padding: 5px 10px;
          border-radius: 6px;
          color: #38bdf8;
        }
        .progress-bar {
          background: #334155;
          border-radius: 8px;
          height: 12px;
          width: 100%;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #a855f7);
          transition: width 0.3s ease;
        }
        .status {
          font-size: 0.9em;
          color: #94a3b8;
        }
        .exhausted { color: #f43f5e; font-weight: bold; }
        .active { color: #10b981; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🛠️ API Quota Tracker</h1>
        <p style="color: #94a3b8;">Total Configured Keys: ${apiKeys.length} | Daily Limit per Key: ${DAILY_LIMIT}</p>
  `;

  apiKeys.forEach((key, index) => {
    let masked = 'UNCONFIGURED';
    if (key && key.length > 10) {
      masked = key.substring(0, 8) + '••••••••' + key.substring(key.length - 4);
    }
    const usage = keyUsage[index];
    const pct = Math.min((usage.count / DAILY_LIMIT) * 100, 100);
    const isExhausted = usage.count >= DAILY_LIMIT;
    const isActive = (index === currentKeyIndex && !isExhausted);

    let statusText = 'Standby';
    if (isExhausted) statusText = '<span class="exhausted">Exhausted</span>';
    else if (isActive) statusText = '<span class="active">Active Now</span>';

    html += `
        <div class="key-card" style="border-left: 4px solid ${isActive ? '#10b981' : (isExhausted ? '#ef4444' : '#64748b')}">
          <div class="header-row">
            <div>
              <span class="key-name">${masked}</span>
              <span style="margin-left: 10px; font-size:0.8rem; color: #94a3b8;">Index ${index}</span>
            </div>
            <div>${statusText}</div>
          </div>
          <div class="header-row" style="margin-bottom: 8px;">
            <span class="status">Usage Today</span>
            <span><strong>${usage.count}</strong> / ${DAILY_LIMIT}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%; ${isExhausted ? 'background: #ef4444;' : ''}"></div>
          </div>
        </div>
    `;
  });

  html += `
      </div>
    </body>
    </html>
  `;

  res.send(html);
});

// ─── Live transcript threat analysis ─────────────────────────────────────────
app.post('/analyze', async (req, res) => {
  const { transcript } = req.body;

  if (!transcript || transcript.trim().length < 5) {
    return res.json({
      score: 0,
      category: 'Safe',
      flaggedPhrases: [],
      reasoning: 'Not enough conversation to analyze yet.',
    });
  }

  try {
    const result = await executeWithKeyRotation(model => model.generateContent(buildAnalysisPrompt(transcript)));
    const analysis = parseAIResponse(result.response.text().trim());
    res.json(analysis);
  } catch (err) {
    console.error('[Analyze] Error:', err.message);
    res.status(500).json({
      score: 0,
      category: 'Safe',
      flaggedPhrases: [],
      reasoning: 'AI analysis temporarily unavailable. Please check your server configuration.',
    });
  }
});

// ─── Audio file upload: transcribe + analyze ──────────────────────────────────
app.post('/analyze-audio', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file received.' });

  const tmpPath = req.file.path;
  const mimeType = resolveMimeType(req.file, 'audio/mpeg');

  try {
    // Read the audio file and encode it as base64
    const audioData = fs.readFileSync(tmpPath);
    const base64Audio = audioData.toString('base64');

    const prompt = `
You are an expert at detecting phone scams, vishing (voice phishing), and social engineering attacks.

I am providing you with a phone call audio recording. Please:
1. Transcribe the full audio content
2. Analyze the transcript for spam, phishing, or social engineering threats

Return a JSON response ONLY (no markdown, no extra text) in this exact format:
{
  "transcript": <full word-for-word transcription of the audio>,
  "score": <integer 0-100, threat probability>,
  "category": <"Safe" | "Spam" | "Suspicious" | "Vishing Attempt" | "Social Engineering" | "High Risk">,
  "flaggedPhrases": [<list of exact quoted suspicious phrases from the transcript, max 5>],
  "reasoning": <1-2 sentence plain-English explanation of your threat assessment>
}

Respond with valid JSON only — no markdown fences, no extra text.
`;

    const result = await executeWithKeyRotation(model => model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Audio,
        },
      },
    ]));

    const analysis = parseAIResponse(result.response.text().trim());
    res.json(analysis);
  } catch (err) {
    console.error('[AudioAnalysis] Error:', err.message);
    res.status(500).json({ error: 'Audio analysis failed. ' + err.message });
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch (_) { }
  }
});

// ─── Live audio chunk transcription ───────────────────────────────────────────
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file received.' });

  const tmpPath = req.file.path;
  const mimeType = resolveMimeType(req.file, 'audio/webm');

  try {
    const audioData = fs.readFileSync(tmpPath);
    const base64Audio = audioData.toString('base64');

    const prompt = `
You are a highly accurate transcription assistant. 
Please transcribe the following audio clip exactly word for word.
Do not add any commentary, analysis, or introductory text.
Return the result STRICTLY as a JSON object in this format:
{
  "transcript": "<the exact words spoken in the audio>"
}
If the audio is silent or contains no legible speech, return {"transcript": ""}.
`;

    const result = await executeWithKeyRotation(model => model.generateContent([
      prompt,
      { inlineData: { mimeType: mimeType, data: base64Audio } }
    ]));

    const data = parseAIResponse(result.response.text());
    res.json({ transcript: data.transcript || '' });
  } catch (err) {
    console.error('[Transcribe] Error:', err.message);
    res.status(500).json({ error: 'Transcription failed.', transcript: '' });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) { }
  }
});

// ─── Helper: get local network (LAN) IP ──────────────────────────────────────
// Used to tell mobile users which IP to type in their phone browser.
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip loopback (127.x) and IPv6 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '(unknown LAN IP)';
}

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

// Bind to 0.0.0.0 (all network interfaces) so phones on the same WiFi
// can reach the backend directly using the laptop's LAN IP.
server.listen(PORT, '0.0.0.0', () => {
  const lanIP = getLanIP();
  console.log(`\n🚀 VishGuard Backend running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${lanIP}:${PORT}  ←  use this URL on your phone`);
  console.log(`   Health:  http://${lanIP}:${PORT}/health`);
  console.log(`\n📱 Mobile setup: set VITE_BACKEND_URL=http://${lanIP}:${PORT} in frontend/.env\n`);
});


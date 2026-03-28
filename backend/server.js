require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const server = http.createServer(app);

// Allow all origins in production (GitHub Pages, mobile browsers, etc.)
// For tighter security, replace '*' with your GitHub Pages URL after deployment.
app.use(cors({ origin: '*' }));
app.use(express.json());

// Multer for audio file uploads
const upload = multer({ dest: os.tmpdir() });

// AI analysis client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(jsonString);
}

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
    const result = await aiModel.generateContent(buildAnalysisPrompt(transcript));
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
  const mimeType = req.file.mimetype || 'audio/mpeg';

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

    const result = await aiModel.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Audio,
        },
      },
    ]);

    const analysis = parseAIResponse(result.response.text().trim());
    res.json(analysis);
  } catch (err) {
    console.error('[AudioAnalysis] Error:', err.message);
    res.status(500).json({ error: 'Audio analysis failed. ' + err.message });
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

// ─── Live audio chunk transcription ───────────────────────────────────────────
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file received.' });

  const tmpPath = req.file.path;
  const mimeType = req.file.mimetype || 'audio/webm';

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

    const result = await aiModel.generateContent([
      prompt,
      { inlineData: { mimeType: mimeType, data: base64Audio } }
    ]);

    const data = parseAIResponse(result.response.text());
    res.json({ transcript: data.transcript || '' });
  } catch (err) {
    console.error('[Transcribe] Error:', err.message);
    res.status(500).json({ error: 'Transcription failed.', transcript: '' });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🚀 VishGuard Backend running on http://localhost:${PORT}`);
  console.log(`   AI analysis engine ready`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

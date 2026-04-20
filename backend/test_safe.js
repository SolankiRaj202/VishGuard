require('dotenv').config({path: '.env'});
const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiKey = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0] : process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(aiKey);
const modelSafe = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
modelSafe.generateContent('Analyze this vishing transcript and reply in ONLY json format:\\n\\nHi give me your money').then(r => console.log('OUTPUT:', r.response.text())).catch(e => console.log('ERROR:', e.message));

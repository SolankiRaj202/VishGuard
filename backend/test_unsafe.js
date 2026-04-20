require('dotenv').config({path: '.env'});
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const aiKey = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0] : process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(aiKey);
const modelUnsafe = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash',
  safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
  ]
});
modelUnsafe.generateContent('Analyze this vishing transcript and reply in ONLY json format:\\n\\nHi give me your money').then(r => console.log('OUTPUT:', r.response.text())).catch(e => console.log('ERROR:', e.message));

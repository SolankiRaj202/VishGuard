require('dotenv').config({path: '.env'});
const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiKey = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0] : process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(aiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
model.generateContent('Return exactly the JSON object {"a": 1}').then(r => console.log(r.response.text())).catch(console.error);

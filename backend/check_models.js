require('dotenv').config({path: '.env'});
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function checkModels() {
  const aiKey = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0] : process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(aiKey);
  
  // The fetch logic to list models natively using API key since listModels isn't perfectly supported in all SDKs
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${aiKey}`);
  const data = await response.json();
  const models = data.models ? data.models.map(m => m.name) : data;
  console.log(models);
}

checkModels().catch(console.error);

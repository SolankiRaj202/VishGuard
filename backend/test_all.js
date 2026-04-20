require('dotenv').config({path: '.env'});
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function check() {
  const aiKey = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',')[0] : process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(aiKey);
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash-lite'];
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      await model.generateContent('hi');
      console.log(`✅ ${m} worked!`);
    } catch (e) {
      console.log(`❌ ${m} failed: ${e.status} - ${e.message.split('\n')[0]}`);
    }
  }
}
check().catch(console.error);

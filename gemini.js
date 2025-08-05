const fetch = require('node-fetch'); // node-fetch v2 syntax

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = process.env.GEMINI_API_URL; // 2.5-Flash endpoint

async function geminiFlashFactCheck(msg, context, type = "factcheck") {
  const prompt = (type === "factcheck"
    ? `You're an experienced fact-checker. ONLY answer as JSON:` +
      `{"flag":true|false,"type":"(fact inaccuracy|contradiction|fallacy)","confidence":0-1,"reason":<short string>}\n` +
      `Message: """${msg}"""\nWeb context:\n${context}\n`
    : msg);

  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({ prompt, model: "gemini-2.5-flash", maxTokens: 256 }),
  });
  const data = await res.json();
  try {
    if (typeof data.result === "string") return JSON.parse(data.result);
    return data;
  } catch {
    return { flag: false, confidence: 0 };
  }
}

module.exports = {
  geminiFlashFactCheck
};
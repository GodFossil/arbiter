const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = process.env.GEMINI_API_URL;         // 2.5-Flash endpoint
const GEMINI_PRO_API_URL = process.env.GEMINI_PRO_API_URL; // 2.5-Pro endpoint

const GEMINI_PRO_QUOTA = Number(process.env.GEMINI_PRO_QUOTA) || 500;
let geminiProCount = 0;

function shouldUseGeminiPro() {
  return geminiProCount < GEMINI_PRO_QUOTA;
}
function incrementGeminiProUsage() {
  geminiProCount++;
}

// Cheap, background fact/fallacy check (Flash)
async function geminiFlashFactCheck(msg, context, type = "factcheck") {
  const prompt = (type === "factcheck"
    ? `You're an experienced fact-checker. ONLY answer as JSON: ` +
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
  } catch { return { flag: false, confidence: 0 }; }
}

// Pro check for high-confidence QA or user-facing work
async function geminiProFactCheck(msg, context, specifiedType) {
  const prompt =
    `Act as a rigorous fact checker. ONLY answer in JSON: ` +
    `{"flag":true|false,"type":"${specifiedType || "<type>"}","confidence":0-1,"reason":<1-2 sentences>}\n` +
    `Message: "${msg}"\nWeb context:\n${context}`;
  const res = await fetch(GEMINI_PRO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({ prompt, model: "gemini-2.5-pro", maxTokens: 256 }),
  });
  const data = await res.json();
  try {
    if (typeof data.result === "string") return JSON.parse(data.result);
    return data;
  } catch { return { flag: false, confidence: 0 }; }
}

module.exports = {
  geminiFlashFactCheck,
  geminiProFactCheck,
  shouldUseGeminiPro,
  incrementGeminiProUsage,
};
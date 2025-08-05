const { GoogleGenerativeAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // Default to flash

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function geminiFactCheck(msg, context = "", type = "factcheck") {
  const prompt = (type === "factcheck"
    ? `You're an experienced fact-checker. ONLY answer as JSON:` +
      `{"flag":true|false,"type":"(fact inaccuracy|contradiction|fallacy)","confidence":0-1,"reason":<short string>}\n` +
      `Message: """${msg}"""\nWeb context:\n${context}\n`
    : msg);

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (type === "factcheck") {
      try {
        return JSON.parse(text);
      } catch {
        return { flag: false, confidence: 0, reason: text };
      }
    }
    return { reason: text };
  } catch (err) {
    console.error("Gemini SDK error:", err);
    return { flag: false, confidence: 0, reason: "Error or unauthenticated." };
  }
}

module.exports = { geminiFactCheck };
// gemini.js
const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function geminiRequest(prompt, modelNames, opts = {}) {
  for (const model of modelNames) {
    try {
      const res = await axios.post(
        `${GEMINI_URL}/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          ...opts,
        }
      );
      const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { result: text, modelUsed: model };
    } catch (err) {
      if (model === modelNames[modelNames.length - 1]) throw err;
    }
  }
  throw new Error("All Gemini models failed");
}

exports.geminiBackground = (prompt, opts) =>
  geminiRequest(prompt, ['gemini-2.5-flash-lite', 'exa'], opts);

exports.geminiUserFacing = (prompt, opts) =>
  geminiRequest(prompt, ['gemini-2.5-pro', 'gemini-2.5-flash'], opts);
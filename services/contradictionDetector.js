const axios = require('axios');
const logger = require('./logger');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

/**
 * Detect whether two statements contradict, support, or are neutral.
 * Uses gemini-2.5-flash-lite.
 */
async function detectRelation(claimA, claimB) {
  const prompt = `
You are a contradiction detector. Compare the two statements and classify their relationship as SUPPORT, CONTRADICT, or NEUTRAL.

Statement A: ${claimA}
Statement B: ${claimB}

Reply with exactly one word in uppercase.
`;

  try {
    const { data } = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 10000 }
    );
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
    return ['SUPPORT', 'CONTRADICT', 'NEUTRAL'].includes(result) ? result : 'NEUTRAL';
  } catch (err) {
    logger.error('Gemini contradictionDetector failed:', err.message);
    return 'NEUTRAL';
  }
}

module.exports = { detectRelation };
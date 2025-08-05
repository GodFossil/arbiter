const axios = require('axios');
const logger = require('./logger');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

/**
 * Interactive step-by-step verification via DM prompts.
 */
async function interactiveVerify(claim) {
  const prompt = `
You are an interactive fact-check guide. The user is verifying: "${claim}"
Provide a 3-step verification process (max 100 words per step) that the user can follow manually.
`;

  try {
    const { data } = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 10000 }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No guide available.';
  } catch (err) {
    logger.error('interactiveVerify failed:', err);
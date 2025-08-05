<<<<<<< HEAD
const axios = require('axios');
const logger = require('./logger');

const GEMINI_URL_PRO = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';
const GEMINI_URL_FLASH = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Create a concise, user-facing fact-check response.
 * Uses gemini-2.5-pro (with fallback to flash) for quality.
 */
async function buildFactCheckReply(claim, verdict, sources, confidence) {
  const prompt = `
You are a friendly Discord fact-check bot. Given:
Claim: ${claim}
Verdict: ${verdict}
Confidence: ${Math.round(confidence * 100)}%
Sources:
${sources.map(s => `- ${s.title} (${s.link})`).join('\n')}

Write a short, conversational reply (max 1200 chars) that states the verdict and cites the sources naturally. Do **not** mention confidence unless it is below 0.5.
`;

  try {
    const { data } = await axios.post(
      `${GEMINI_URL_PRO}?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 15000 }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to summarise.';
  } catch (err) {
    logger.warn('gemini-2.5-pro failed, falling back to flash');
    const { data } = await axios.post(
      `${GEMINI_URL_FLASH}?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 15000 }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to summarise.';
  }
}

module.exports = { buildFactCheckReply };
=======
// FactCheck.js
const FactChecker = require('./factChecker');
const logger = require('./logger');

class FactCheck {
    constructor() {
        this.factChecker = FactChecker;
    }

    async processMessage(message) {
        try {
            logger.info(`Processing message from ${message.author.username}: ${message.content}`);
            
            const result = await this.factChecker.check(message.content);
            
            return {
                success: true,
                result
            };
        } catch (error) {
            logger.error('FactCheck process error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new FactCheck();
>>>>>>> 0c4931a (Qwen 3 Code)

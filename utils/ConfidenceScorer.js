<<<<<<< HEAD
const axios = require('axios');
const logger = require('./logger');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

/**
 * Produce a 0-1 confidence score based on sources & reasoning.
 * Uses gemini-2.5-flash-lite.
 */
async function scoreConfidence(claim, sources) {
  const prompt = `
You are a fact-check confidence scorer. Rate how well the provided sources support the claim.

Claim: ${claim}

Sources:
${sources.map((s, i) => `${i + 1}. ${s.snippet || s.description}`).join('\n')}

Return a single float between 0 and 1, with 1 meaning fully verified. Reply with only the number.
`;

  try {
    const { data } = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 10000 }
    );
    const num = parseFloat(data.candidates?.[0]?.content?.parts?.[0]?.text || '0');
    return Math.min(Math.max(num, 0), 1);
  } catch (err) {
    logger.error('Gemini confidenceScorer failed:', err.message);
    return 0.5; // neutral fallback
  }
}

module.exports = { scoreConfidence };
=======
// confidenceScorer.js
const geminiClient = require('./geminiClient');
const logger = require('./logger');

class ConfidenceScorer {
    async scoreConfidence(claim, evidence) {
        try {
            const prompt = `
            Score the confidence level (0-100) that the following claim is true based on the provided evidence.
            
            Claim: "${claim}"
            
            Evidence: "${evidence}"
            
            Return ONLY a number between 0 and 100 representing the confidence level.
            `;
            
            const response = await geminiClient.generateContent(
                prompt, 
                'gemini-2.0-flash',
                { maxTokens: 10 }
            );
            
            const score = parseInt(response.trim(), 10);
            return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
        } catch (error) {
            logger.error('Confidence scoring error:', error);
            return 50; // Default neutral score
        }
    }
}

module.exports = new ConfidenceScorer();
>>>>>>> 0c4931a (Qwen 3 Code)

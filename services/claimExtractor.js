<<<<<<< HEAD
const axios = require('axios');
const logger = require('./logger');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

/**
 * Extract factual claims from raw text.
 * Uses gemini-2.5-flash-lite for token efficiency.
 */
async function extractClaims(text) {
  const prompt = `
You are a claim extraction assistant. From the following text, extract every standalone factual claim that can be objectively verified. Return JSON only.

Example output:
[
  "The Eiffel Tower is 330 meters tall.",
  "Water boils at 100°C at sea level."
]

Text: ${text}
`;

  try {
    const { data } = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      },
      { timeout: 10000 }
    );
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    return JSON.parse(raw);
  } catch (err) {
    logger.error('Gemini extractClaims failed:', err.message);
    return [];
  }
}

module.exports = { extractClaims };
=======
// claimExtractor.js
const geminiClient = require('./geminiClient');
const logger = require('./logger');

class ClaimExtractor {
    async extractClaims(text) {
        try {
            const prompt = `
            Extract factual claims from the following text. Return only a JSON array of claims.
            
            Text: "${text}"
            
            Output format:
            ["claim 1", "claim 2", ...]
            `;
            
            const response = await geminiClient.generateContent(
                prompt, 
                'gemini-2.0-flash',
                { maxTokens: 1000 }
            );
            
            try {
                return JSON.parse(response);
            } catch (parseError) {
                logger.error('Failed to parse claims JSON:', parseError);
                return [];
            }
        } catch (error) {
            logger.error('Claim extraction error:', error);
            return [];
        }
    }
}

module.exports = new ClaimExtractor();
>>>>>>> 0c4931a (Qwen 3 Code)

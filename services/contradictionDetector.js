<<<<<<< HEAD
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
=======
// contradictionDetector.js
const geminiClient = require('./geminiClient');
const logger = require('./logger');

class ContradictionDetector {
    async detectContradictions(claims) {
        try {
            const prompt = `
            Analyze the following claims for contradictions. Return a JSON object with contradictory claim pairs.
            
            Claims: ${JSON.stringify(claims, null, 2)}
            
            Output format:
            {
                "contradictions": [
                    {
                        "claim1": "first contradictory claim",
                        "claim2": "second contradictory claim",
                        "explanation": "explanation of contradiction"
                    }
                ]
            }
            `;
            
            const response = await geminiClient.generateContent(
                prompt, 
                'gemini-2.0-flash',
                { maxTokens: 1500 }
            );
            
            try {
                return JSON.parse(response);
            } catch (parseError) {
                logger.error('Failed to parse contradictions JSON:', parseError);
                return { contradictions: [] };
            }
        } catch (error) {
            logger.error('Contradiction detection error:', error);
            return { contradictions: [] };
        }
    }
}

module.exports = new ContradictionDetector();
>>>>>>> 0c4931a (Qwen 3 Code)

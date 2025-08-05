const axios = require('axios');
const logger = require('./logger');

class ConfidenceScorer {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-lite';
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    async calculateScore(claim, sources) {
        try {
            const sourcesText = sources.map((source, index) => 
                `Source ${index + 1}: ${source.title}\n${source.snippet}\nRelevance: ${source.relevance}`
            ).join('\n\n');

            const prompt = `Analyze the following claim and sources to determine a confidence score.

Claim: "${claim}"

Sources:
${sourcesText}

Consider:
1. Source reliability and authority
2. Consistency across sources
3. Evidence quality
4. Recency of information

Return a JSON object with:
{
    "score": 0-100,
    "reasoning": "brief explanation",
    "reliability": "high|medium|low",
    "flag": "none|disputed|outdated|unverified"
}`;

            const response = await axios.post(`${this.apiUrl}?key=${this.apiKey}`, {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.1,
                    maxOutputTokens: 1024
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            const result = JSON.parse(content);
            
            logger.info(`Calculated confidence score: ${result.score} for claim: ${claim.substring(0, 50)}...`);
            return result;
        } catch (error) {
            logger.error('Error calculating confidence score:', error);
            return {
                score: 50,
                reasoning: 'Error in analysis',
                reliability: 'medium',
                flag: 'unverified'
            };
        }
    }

    async adjustScore(current, newInfo) {
        try {
            const prompt = `Adjust the confidence score based on new information.

Current score: ${current}
New information: ${newInfo}

Return only the new score (0-100) as a number.`;

            const response = await axios.post(`${this.apiUrl}?key=${this.apiKey}`, {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.1,
                    maxOutputTokens: 10
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            return parseInt(content.trim()) || current;
        } catch (error) {
            logger.error('Error adjusting confidence score:', error);
            return current;
        }
    }
}

module.exports = new ConfidenceScorer();
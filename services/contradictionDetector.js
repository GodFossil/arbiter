const axios = require('axios');
const logger = require('./logger');

class ContradictionDetector {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-lite';
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    async detectContradictions(claims) {
        try {
            const claimsText = claims.map((c, i) => `${i + 1}. ${c.claim}`).join('\n');

            const prompt = `Analyze these claims for contradictions:

${claimsText}

Return a JSON object with:
{
    "contradictions": [
        {
            "claim1": "text of first claim",
            "claim2": "text of second claim",
            "severity": "high|medium|low",
            "explanation": "why they contradict"
        }
    ],
    "totalContradictions": number
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
                    maxOutputTokens: 2048
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            const result = JSON.parse(content);
            
            logger.info(`Found ${result.totalContradictions} contradictions`);
            return result;
        } catch (error) {
            logger.error('Error detecting contradictions:', error);
            return { contradictions: [], totalContradictions: 0 };
        }
    }

    async checkAgainstPrevious(claim, previousChecks) {
        try {
            const prompt = `Check if this new claim contradicts any previous checked claims:

New claim: "${claim}"

Previous claims:
${previousChecks.map(c => `- ${c.claim} (${c.verdict})`).join('\n')}

Return JSON: {"contradicts": boolean, "with": "previous claim text", "explanation": "why"}`;

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
                    maxOutputTokens: 512
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            return JSON.parse(content);
        } catch (error) {
            logger.error('Error checking against previous claims:', error);
            return { contradicts: false };
        }
    }
}

module.exports = new ContradictionDetector();
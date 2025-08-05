const axios = require('axios');
const logger = require('./logger');

class FactCheck {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-lite';
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    async check(claim, sources = []) {
        try {
            const sourcesText = sources.length > 0 
                ? sources.map(s => `- ${s.title}: ${s.snippet}`).join('\n')
                : 'No sources provided';

            const prompt = `Fact-check this claim: "${claim}"

Available sources:
${sourcesText}

Provide a JSON response with:
{
    "verdict": "true|false|partially_true|unverifiable|misleading",
    "confidence": 0-100,
    "explanation": "detailed explanation",
    "evidence": ["list of supporting evidence"],
    "sources": ["relevant sources"],
    "nuances": "any important nuances or context"
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
            
            logger.info(`Fact-check result: ${claim.substring(0, 50)}... - ${result.verdict}`);
            return result;
        } catch (error) {
            logger.error('Error in fact-check:', error);
            return {
                verdict: 'unverifiable',
                confidence: 0,
                explanation: 'Unable to fact-check due to an error',
                evidence: [],
                sources: [],
                nuances: ''
            };
        }
    }

    async quickCheck(claim) {
        try {
            const prompt = `Quick fact-check: "${claim}"
Return JSON: {"verdict": "true|false|unclear", "confidence": 0-100}`;

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
                    maxOutputTokens: 100
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            return JSON.parse(content);
        } catch (error) {
            logger.error('Error in quick fact-check:', error);
            return { verdict: 'unclear', confidence: 0 };
        }
    }
}

module.exports = new FactCheck();
const axios = require('axios');
const logger = require('./logger');

class ClaimExtractor {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-lite';
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    async extractClaims(text) {
        try {
            const prompt = `Extract all factual claims from the following text. Return a JSON array of objects, each with "claim" and "confidence" (0-1) fields. Be precise and specific.

Text: "${text}"

Respond with only the JSON array, no additional text.`;

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
            const claims = JSON.parse(content);
            
            logger.info(`Extracted ${claims.length} claims from text`);
            return claims;
        } catch (error) {
            logger.error('Error extracting claims:', error);
            return [{
                claim: text,
                confidence: 0.5
            }];
        }
    }

    async extractWithContext(message, context) {
        try {
            const prompt = `Given the following message and its context, extract the factual claims that need verification. Consider the context to avoid extracting obvious jokes or rhetorical questions.

Message: "${message}"
Context: ${context}

Return a JSON array of objects with "claim" and "confidence" (0-1) fields.`;

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
            return JSON.parse(content);
        } catch (error) {
            logger.error('Error extracting claims with context:', error);
            return this.extractClaims(message);
        }
    }
}

module.exports = new ClaimExtractor();
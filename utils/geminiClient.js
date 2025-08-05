// geminiClient.js
const axios = require('axios');
const logger = require('./logger');

class GeminiClient {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is not set in environment variables');
        }
    }

    async generateContent(prompt, model, options = {}) {
        try {
            const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
            
            const payload = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 1000,
                    ...options.generationConfig
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (response.data.candidates && response.data.candidates.length > 0) {
                const candidate = response.data.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    return candidate.content.parts[0].text;
                }
            }
            
            throw new Error('No content generated');
        } catch (error) {
            logger.error(`Gemini API error with model ${model}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async embedContent(content, model = 'models/text-embedding-004') {
        try {
            const url = `${this.baseUrl}/${model}:embedContent?key=${this.apiKey}`;
            
            const payload = {
                model: model,
                content: {
                    parts: [{
                        text: content
                    }]
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.data.embedding.values;
        } catch (error) {
            logger.error('Gemini Embedding API error:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new GeminiClient();
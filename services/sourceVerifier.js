const axios = require('axios');
const logger = require('./logger');

class SourceVerifier {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-lite';
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    async verify(source) {
        try {
            const prompt = `Analyze this source for reliability:

Title: ${source.title}
URL: ${source.url}
Snippet: ${source.snippet}

Return JSON:
{
    "reliability": "high|medium|low",
    "reasoning": "brief explanation",
    "bias": "left|right|center|unknown",
    "authority": "organization or author",
    "lastUpdated": "YYYY-MM-DD or unknown"
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
                    maxOutputTokens: 512
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            const analysis = JSON.parse(content);
            
            logger.info(`Verified source: ${source.url} - ${analysis.reliability}`);
            return { ...source, ...analysis };
        } catch (error) {
            logger.error('Error verifying source:', error);
            return { ...source, reliability: 'medium', error: error.message };
        }
    }

    async getDetailedAnalysis(url) {
        try {
            const prompt = `Provide a detailed analysis of this source:

URL: ${url}

Include:
- Domain authority
- About page info
- Contact information
- Fact-checking reputation
- Known biases

Return JSON with these fields.`;

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
            return JSON.parse(content);
        } catch (error) {
            logger.error('Error getting detailed analysis:', error);
            return {
                summary: 'Unable to analyze source',
                recommendations: ['Check the source manually']
            };
        }
    }

    async checkDomainReliability(domain) {
        // Check against known reliable/unreliable sources
        const reliableDomains = [
            'bbc.com', 'reuters.com', 'ap.org', 'npr.org', 'pbs.org',
            'nature.com', 'science.org', 'who.int', 'cdc.gov', 'nasa.gov'
        ];
        
        const unreliableDomains = [
            'theonion.com', 'clickhole.com', 'infowars.com', 'naturalnews.com'
        ];

        if (reliableDomains.some(d => domain.includes(d))) {
            return { reliability: 'high', reason: 'Known reliable source' };
        }
        
        if (unreliableDomains.some(d => domain.includes(d))) {
            return { reliability: 'low', reason: 'Known unreliable source' };
        }

        return { reliability: 'medium', reason: 'Unknown source' };
    }
}

module.exports = new SourceVerifier();
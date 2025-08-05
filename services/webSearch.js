const axios = require('axios');
const logger = require('./logger');

class WebSearch {
    constructor() {
        this.apiKey = process.env.SERPER_API_KEY;
        this.baseUrl = 'https://google.serper.dev/search';
    }

    async search(query, options = {}) {
        try {
            const {
                numResults = 5,
                includeSources = 'all',
                dateRange = 'all'
            } = options;

            const response = await axios.post(this.baseUrl, {
                q: query,
                num: numResults,
                type: includeSources,
                tbs: this.getDateRangeParam(dateRange)
            }, {
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const results = response.data.organic || [];
            
            // Format results
            const formattedResults = results.map(result => ({
                title: result.title,
                url: result.link,
                snippet: result.snippet,
                position: result.position,
                date: result.date || null,
                source: this.extractDomain(result.link),
                relevance: this.calculateRelevance(result, query)
            }));

            logger.info(`Found ${formattedResults.length} results for: ${query}`);
            return formattedResults;
        } catch (error) {
            logger.error('Error in web search:', error);
            return [];
        }
    }

    async searchNews(query, options = {}) {
        try {
            const response = await axios.post('https://google.serper.dev/news', {
                q: query,
                num: options.numResults || 5,
                gl: options.country || 'us',
                hl: options.language || 'en'
            }, {
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            const results = response.data.news || [];
            
            return results.map(result => ({
                title: result.title,
                url: result.link,
                snippet: result.snippet,
                date: result.date,
                source: result.source,
                image: result.imageUrl || null,
                relevance: this.calculateRelevance(result, query)
            }));
        } catch (error) {
            logger.error('Error in news search:', error);
            return [];
        }
    }

    getDateRangeParam(range) {
        const ranges = {
            'day': 'qdr:d',
            'week': 'qdr:w',
            'month': 'qdr:m',
            'year': 'qdr:y',
            'all': ''
        };
        return ranges[range] || ranges.all;
    }

    extractDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    }

    calculateRelevance(result, query) {
        const title = result.title.toLowerCase();
        const snippet = result.snippet.toLowerCase();
        const queryLower = query.toLowerCase();
        
        let score = 0;
        
        // Exact match bonus
        if (title.includes(queryLower)) score += 3;
        if (snippet.includes(queryLower)) score += 2;
        
        // Word match
        const queryWords = queryLower.split(' ');
        queryWords.forEach(word => {
            if (title.includes(word)) score += 1;
            if (snippet.includes(word)) score += 0.5;
        });
        
        // Domain authority bonus
        const domain = this.extractDomain(result.link);
        const trustedDomains = ['bbc.com', 'reuters.com', 'ap.org', 'npr.org'];
        if (trustedDomains.some(td => domain.includes(td))) {
            score += 2;
        }
        
        return Math.min(score, 10);
    }

    async validateQuery(query) {
        // Basic query validation
        if (!query || query.length < 3) {
            throw new Error('Query too short');
        }
        
        if (query.length > 500) {
            throw new Error('Query too long');
        }
        
        // Check for malicious patterns
        const maliciousPatterns = [
            /javascript:/i,
            /data:/i,
            /vbscript:/i,
            /<script/i
        ];
        
        if (maliciousPatterns.some(pattern => pattern.test(query))) {
            throw new Error('Invalid query format');
        }
        
        return true;
    }
}

module.exports = new WebSearch();
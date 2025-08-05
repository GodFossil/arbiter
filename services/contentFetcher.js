const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('./logger');

class ContentFetcher {
    constructor() {
        this.timeout = 10000;
        this.maxContentLength = 5000;
    }

    async fetchContent(url) {
        try {
            logger.info(`Fetching content from: ${url}`);
            
            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)'
                },
                maxRedirects: 5
            });

            const $ = cheerio.load(response.data);
            
            // Remove script and style elements
            $('script, style, nav, footer, header').remove();
            
            // Extract main content
            const title = $('title').text().trim() || $('h1').first().text().trim();
            let content = '';
            
            // Try to find main content areas
            const contentSelectors = [
                'main',
                'article',
                '[role="main"]',
                '.content',
                '.main-content',
                '#content',
                '#main',
                '.post-content',
                '.entry-content'
            ];

            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length) {
                    content = element.text();
                    break;
                }
            }

            // Fallback to body content
            if (!content) {
                content = $('body').text();
            }

            // Clean up content
            content = content
                .replace(/\s+/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim()
                .substring(0, this.maxContentLength);

            const result = {
                title,
                content,
                url,
                fetchedAt: new Date().toISOString()
            };

            logger.info(`Successfully fetched content: ${title}`);
            return result;
        } catch (error) {
            logger.error(`Error fetching content from ${url}:`, error.message);
            throw new Error(`Failed to fetch content: ${error.message}`);
        }
    }

    async fetchMultiple(urls) {
        const results = await Promise.allSettled(
            urls.map(url => this.fetchContent(url))
        );

        return results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
    }
}

module.exports = new ContentFetcher();
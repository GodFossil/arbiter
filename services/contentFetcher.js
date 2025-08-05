<<<<<<< HEAD
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('./logger');

/**
 * Download & parse article text from a URL.
 */
async function fetchContent(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot)' }
    });
    const $ = cheerio.load(res.data);
    $('script, style, nav, footer, aside').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  } catch (err) {
    logger.warn(`fetchContent failed for ${url}: ${err.message}`);
    return null;
  }
}

module.exports = { fetchContent };
=======
// contentFetcher.js
const axios = require('axios');
const logger = require('./logger');

class ContentFetcher {
    async fetchContent(url) {
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'FactCheckBot/1.0'
                }
            });
            
            return response.data;
        } catch (error) {
            logger.error(`Failed to fetch content from ${url}:`, error.message);
            throw error;
        }
    }
}

module.exports = new ContentFetcher();
>>>>>>> 0c4931a (Qwen 3 Code)

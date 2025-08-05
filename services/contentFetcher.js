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
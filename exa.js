// exa.js
const axios = require('axios');

const EXA_API_KEY = process.env.EXA_API_KEY;
const EXA_SEARCH_URL = 'https://api.exa.ai/search';

/**
 * Performs a web search using Exa AI API.
 * @param {string} query - The search string (message content).
 * @param {number} numResults - Number of results (default: 5).
 * @returns {Promise<Array>} Array of search result objects.
 */
async function exaWebSearch(query, numResults = 5) {
  try {
    const response = await axios.post(
      EXA_SEARCH_URL,
      { query, numResults },
      { headers: { 'Authorization': `Bearer ${EXA_API_KEY}` } }
    );
    return response.data.results || [];
  } catch (err) {
    console.warn('Exa API search failed:', err.response?.data || err.message);
    return [];
  }
}

module.exports = { exaWebSearch };
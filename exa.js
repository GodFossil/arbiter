const fetch = require('node-fetch');

const EXA_API_KEY = process.env.EXA_API_KEY;
const EXA_API_URL = process.env.EXA_API_URL;

async function exaWebSearch(query, count = 3) {
  const res = await fetch(EXA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EXA_API_KEY}`,
    },
    body: JSON.stringify({ query, count }),
  });
  const data = await res.json();
  return data.results || [];
}

async function exaNewsSearch(topic, count = 3) {
  return exaWebSearch(`${topic} news`, count);
}

module.exports = { exaWebSearch, exaNewsSearch };
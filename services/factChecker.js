const { extractClaims } = require('./claimExtractor');
const { webSearch } = require('./webSearch');
const { verifySources } = require('./sourceVerifier');
const { scoreConfidence } = require('./confidenceScorer');
const { detectRelation } = require('./contradictionDetector');
const logger = require('./logger');

/**
 * End-to-end fact-check pipeline for a single claim.
 */
async function factCheckClaim(claim) {
  try {
    const searchResults = await webSearch(claim);
    if (!searchResults.length) return { claim, verdict: 'No sources found', sources: [], confidence: 0 };

    const verified = await verifySources(claim, searchResults);
    const confidence = await scoreConfidence(claim, verified);
    const verdict = confidence >= 0.8 ? 'Accurate' : confidence >= 0.5 ? 'Mostly accurate' : 'Needs context';

    return { claim, verdict, sources: verified, confidence };
  } catch (err) {
    logger.error('factCheckClaim error:', err);
    return { claim, verdict: 'Error', sources: [], confidence: 0 };
  }
}

/**
 * Fact-check an entire message (may contain many claims).
 */
async function factCheckMessage(text) {
  const claims = await extractClaims(text);
  if (!claims.length) return [];

  const results = await Promise.all(claims.map(async c => ({ ...(await factCheckClaim(c)), claim: c })));
  return results.filter(r => r.confidence < 0.8 || r.verdict === 'Error'); // only report low-confidence or errors
}

module.exports = { factCheckClaim, factCheckMessage };
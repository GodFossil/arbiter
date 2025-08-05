<<<<<<< HEAD
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
=======
// factChecker.js
const claimExtractor = require('./claimExtractor');
const webSearch = require('./webSearch');
const sourceVerifier = require('./sourceVerifier');
const confidenceScorer = require('./confidenceScorer');
const contradictionDetector = require('./contradictionDetector');
const logger = require('./logger');

class FactChecker {
    async check(text) {
        try {
            // Extract claims
            logger.info('Extracting claims...');
            const claims = await claimExtractor.extractClaims(text);
            
            if (!claims || claims.length === 0) {
                return {
                    claims: [],
                    summary: 'No factual claims detected in the text.'
                };
            }
            
            // Process each claim
            const results = [];
            for (const claim of claims) {
                logger.info(`Processing claim: ${claim}`);
                
                // Search for evidence
                const searchResults = await webSearch.search(claim);
                
                // Verify sources
                const verifiedSources = await sourceVerifier.verify(searchResults);
                
                // Score confidence
                const confidence = await confidenceScorer.scoreConfidence(claim, verifiedSources.join(' '));
                
                results.push({
                    claim,
                    confidence,
                    sources: verifiedSources.slice(0, 3), // Top 3 sources
                    searchResults: searchResults.slice(0, 5) // Top 5 results
                });
            }
            
            // Check for contradictions
            logger.info('Checking for contradictions...');
            const contradictions = await contradictionDetector.detectContradictions(claims);
            
            // Generate summary
            const summary = await this.generateSummary(results, contradictions);
            
            return {
                claims: results,
                contradictions: contradictions.contradictions,
                summary
            };
        } catch (error) {
            logger.error('Fact checking error:', error);
            throw error;
        }
    }
    
    async generateSummary(results, contradictions) {
        try {
            let summary = '';
            
            if (results.length > 0) {
                const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
                summary += `Analyzed ${results.length} claims with an average confidence score of ${Math.round(avgConfidence)}%.\n\n`;
                
                const highConfidence = results.filter(r => r.confidence >= 70);
                const lowConfidence = results.filter(r => r.confidence <= 30);
                
                if (highConfidence.length > 0) {
                    summary += `High confidence claims (${highConfidence.length}):\n`;
                    highConfidence.forEach(r => {
                        summary += `- "${r.claim}" (${r.confidence}%)\n`;
                    });
                    summary += '\n';
                }
                
                if (lowConfidence.length > 0) {
                    summary += `Low confidence claims (${lowConfidence.length}):\n`;
                    lowConfidence.forEach(r => {
                        summary += `- "${r.claim}" (${r.confidence}%)\n`;
                    });
                    summary += '\n';
                }
            }
            
            if (contradictions.contradictions && contradictions.contradictions.length > 0) {
                summary += `Found ${contradictions.contradictions.length} contradiction(s):\n`;
                contradictions.contradictions.forEach((c, i) => {
                    summary += `${i+1}. "${c.claim1}" contradicts "${c.claim2}"\n`;
                });
            }
            
            return summary;
        } catch (error) {
            logger.error('Summary generation error:', error);
            return 'Unable to generate summary due to an error.';
        }
    }
}

module.exports = new FactChecker();
>>>>>>> 0c4931a (Qwen 3 Code)

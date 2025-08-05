const claimExtractor = require('./claimExtractor');
const FactCheck = require('./FactCheck');
const confidenceScorer = require('./confidenceScorer');
const sourceVerifier = require('./sourceVerifier');
const webSearch = require('./webSearch');
const contentFetcher = require('./contentFetcher');
const contradictionDetector = require('./contradictionDetector');
const cacheManager = require('./cacheManager');
const logger = require('./logger');
const errorHandler = require('./errorHandler');

class FactChecker {
    constructor() {
        this.maxClaimsPerMessage = 5;
        this.maxSourcesPerClaim = 3;
    }

    async processMessage(message, context = {}) {
        try {
            logger.info(`Processing message: ${message.substring(0, 100)}...`);

            // Check cache
            const cacheKey = `factcheck:${Buffer.from(message).toString('base64')}`;
            const cached = cacheManager.get(cacheKey);
            if (cached) {
                logger.info('Returning cached result');
                return cached;
            }

            // Extract claims
            const claims = await claimExtractor.extractWithContext(message, context);
            if (claims.length === 0) {
                return { type: 'no_claims', message: 'No factual claims found to check.' };
            }

            // Limit claims
            const limitedClaims = claims.slice(0, this.maxClaimsPerMessage);

            // Process each claim
            const results = await Promise.all(
                limitedClaims.map(claim => this.processClaim(claim))
            );

            // Check for contradictions
            const contradictions = await contradictionDetector.detectContradictions(results);

            const finalResult = {
                type: 'fact_check',
                originalMessage: message,
                claims: results,
                contradictions,
                timestamp: new Date().toISOString()
            };

            // Cache result
            cacheManager.set(cacheKey, finalResult, 30);

            return finalResult;
        } catch (error) {
            logger.error('Error processing message:', error);
            return await errorHandler.handle(error, { type: 'fact_check', message });
        }
    }

    async processClaim(claim) {
        try {
            // Search for sources
            const searchResults = await webSearch.search(claim.claim);
            const topSources = searchResults.slice(0, this.maxSourcesPerClaim);

            // Verify sources
            const verifiedSources = await Promise.all(
                topSources.map(source => sourceVerifier.verify(source))
            );

            // Filter reliable sources
            const reliableSources = verifiedSources.filter(s => s.reliability !== 'low');

            // Fact-check
            const factCheckResult = await FactCheck.check(claim.claim, reliableSources);

            // Calculate confidence
            const confidence = await confidenceScorer.calculateScore(claim.claim, reliableSources);

            // Fetch full content for top sources
            const detailedSources = await Promise.all(
                reliableSources.slice(0, 2).map(async source => {
                    try {
                        const content = await contentFetcher.fetchContent(source.url);
                        return { ...source, content: content.content };
                    } catch (error) {
                        logger.warn(`Failed to fetch content for ${source.url}`);
                        return source;
                    }
                })
            );

            return {
                ...claim,
                factCheck: factCheckResult,
                confidence,
                sources: detailedSources,
                checkedAt: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Error processing claim:', error);
            return {
                ...claim,
                factCheck: {
                    verdict: 'error',
                    confidence: 0,
                    explanation: 'Failed to process claim'
                },
                sources: [],
                error: error.message
            };
        }
    }

    async quickCheck(message) {
        try {
            const claims = await claimExtractor.extractClaims(message);
            if (claims.length === 0) return null;

            const result = await FactCheck.quickCheck(claims[0].claim);
            return {
                claim: claims[0].claim,
                verdict: result.verdict,
                confidence: result.confidence
            };
        } catch (error) {
            logger.error('Error in quick check:', error);
            return null;
        }
    }
}

module.exports = new FactChecker();
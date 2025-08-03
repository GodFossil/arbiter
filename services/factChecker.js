class FactChecker {
  constructor(openai, sourceVerifier, cacheManager = null, errorHandler = null) {
    this.openai = openai;
    this.sourceVerifier = sourceVerifier;
    this.cacheManager = cacheManager;
    this.errorHandler = errorHandler;
    this.model = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  }

  async verifyClaimMultiStep(claim) {
    try {
      // Check cache first
      if (this.cacheManager) {
        const cachedResult = this.cacheManager.getFactCheck(claim);
        if (cachedResult) {
          console.log(`Using cached fact-check result for: "${claim.substring(0, 50)}..."`);
          return cachedResult;
        }
      }

      // Step 1: Initial plausibility check with error handling
      const plausibilityCheck = await this.handleStep(
        () => this.checkPlausibility(claim),
        'plausibility_check',
        claim
      );
      
      if (plausibilityCheck.obviously_true || plausibilityCheck.obviously_false) {
        const result = {
          claim,
          status: plausibilityCheck.obviously_true ? 'verified' : 'false',
          confidence: plausibilityCheck.confidence,
          sources: [],
          reasoning: plausibilityCheck.reasoning,
          verification_steps: ['plausibility_check']
        };
        
        // Cache the result
        this.cacheManager?.cacheFactCheck(claim, result);
        return result;
      }

      // Step 2: Search for authoritative sources with error handling
      const sources = await this.handleStep(
        () => this.sourceVerifier.findAuthoritativeSources(claim),
        'source_search',
        claim
      );
      
      // Step 3: Cross-reference multiple sources with error handling
      const sourceAnalysis = await this.handleStep(
        () => this.analyzeSources(claim, sources),
        'source_analysis',
        claim
      );
      
      // Step 4: Final verification with reasoning and error handling
      const finalVerification = await this.handleStep(
        () => this.performFinalVerification(claim, sourceAnalysis),
        'final_verification',
        claim
      );

      const result = {
        claim,
        status: finalVerification.status,
        confidence: finalVerification.confidence,
        sources: sources.slice(0, 5), // Top 5 sources
        reasoning: finalVerification.reasoning,
        verification_steps: ['plausibility_check', 'source_search', 'source_analysis', 'final_verification'],
        source_analysis: sourceAnalysis,
        enhanced_features: {
          cached: false,
          parallel_processing: sources.length > 1,
          content_fetching: sources.some(s => s.contentType === 'full')
        }
      };

      // Cache successful results
      if (result.status !== 'error') {
        this.cacheManager?.cacheFactCheck(claim, result);
      }

      return result;

    } catch (error) {
      if (this.errorHandler) {
        const handledError = await this.errorHandler.handleError(error, {
          service: 'factChecker',
          operation: 'verifyClaimMultiStep',
          claim: claim.substring(0, 100)
        });
        
        if (handledError && !handledError.success) {
          console.error(`Enhanced fact-checking error for claim "${claim}":`, handledError.message);
        }
      } else {
        console.error(`Fact-checking error for claim "${claim}":`, error);
      }
      
      return {
        claim,
        status: 'error',
        confidence: 0,
        sources: [],
        reasoning: 'Unable to verify due to technical issues',
        verification_steps: ['error'],
        enhanced_features: {
          cached: false,
          parallel_processing: false,
          content_fetching: false
        }
      };
    }
  }

  async handleStep(stepFunction, stepName, claim) {
    if (this.errorHandler) {
      return await this.errorHandler.handleError(
        stepFunction,
        {
          service: 'factChecker',
          operation: stepName,
          claim: claim.substring(0, 50),
          useCache: true,
          cacheManager: this.cacheManager
        },
        () => this.getStepFallback(stepName)
      );
    } else {
      return await stepFunction();
    }
  }

  getStepFallback(stepName) {
    switch (stepName) {
      case 'plausibility_check':
        return {
          obviously_true: false,
          obviously_false: false,
          requires_investigation: true,
          confidence: 0.5,
          reasoning: "Unable to perform plausibility check"
        };
      case 'source_search':
        return [];
      case 'source_analysis':
        return {
          consensus: 'insufficient_sources',
          supporting_count: 0,
          refuting_count: 0,
          neutral_count: 0,
          confidence: 0.1
        };
      case 'final_verification':
        return {
          status: 'unverified',
          confidence: 0.3,
          reasoning: 'Unable to complete verification due to service issues',
          recommendations: ['Please verify with additional sources']
        };
      default:
        return null;
    }
  }

  async checkPlausibility(claim) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
You are a fact-checking expert. Evaluate if this claim is obviously true, obviously false, or requires further investigation.

Respond with JSON:
{
  "obviously_true": boolean,
  "obviously_false": boolean,
  "requires_investigation": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "explanation"
}

Only mark as "obviously_true" if it's undisputed common knowledge.
Only mark as "obviously_false" if it contradicts well-established facts.
Most claims should require investigation.
            `.trim(),
          },
          {
            role: "user",
            content: `Evaluate this claim: "${claim}"`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      return {
        obviously_true: false,
        obviously_false: false,
        requires_investigation: true,
        confidence: 0.5,
        reasoning: "Unable to perform plausibility check"
      };
    }
  }

  async analyzeSources(claim, sources) {
    if (!sources || sources.length === 0) {
      return {
        consensus: 'insufficient_sources',
        supporting_count: 0,
        refuting_count: 0,
        neutral_count: 0,
        confidence: 0.1
      };
    }

    try {
      const sourceTexts = sources.map(s => `Source: ${s.title}\nURL: ${s.url}\nContent: ${s.content}`).join('\n\n');
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Analyze these sources to determine their stance on the given claim.

Respond with JSON:
{
  "consensus": "supports|refutes|mixed|insufficient",
  "supporting_count": number,
  "refuting_count": number,
  "neutral_count": number,
  "confidence": 0.0-1.0,
  "source_quality": "high|medium|low",
  "analysis": "detailed explanation"
}
            `.trim(),
          },
          {
            role: "user",
            content: `Claim: "${claim}"\n\nSources:\n${sourceTexts}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      return {
        consensus: 'error',
        supporting_count: 0,
        refuting_count: 0,
        neutral_count: 0,
        confidence: 0,
        source_quality: 'unknown',
        analysis: 'Error analyzing sources'
      };
    }
  }

  async performFinalVerification(claim, sourceAnalysis) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Based on the source analysis, make a final determination about this claim.

Status options:
- "verified": Claim is supported by reliable sources
- "false": Claim is contradicted by reliable sources  
- "unverified": Insufficient or conflicting evidence
- "partially_true": Some aspects are true, others false
- "misleading": Technically true but missing important context

Be conservative - only mark as "false" if you have high confidence.
When in doubt, use "unverified" to avoid false positives.

Respond with JSON:
{
  "status": "verified|false|unverified|partially_true|misleading",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "recommendations": ["suggestion1", "suggestion2"]
}
            `.trim(),
          },
          {
            role: "user",
            content: `Claim: "${claim}"\n\nSource Analysis: ${JSON.stringify(sourceAnalysis, null, 2)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      return {
        status: 'error',
        confidence: 0,
        reasoning: 'Unable to complete verification',
        recommendations: []
      };
    }
  }
}

module.exports = FactChecker;

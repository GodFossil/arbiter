class FactChecker {
constructor(geminiAI, sourceVerifier, cacheManager = null, errorHandler = null) {
this.geminiAI = geminiAI;
this.sourceVerifier = sourceVerifier;
this.cacheManager = cacheManager;
this.errorHandler = errorHandler;

```
// Validation
if (!geminiAI || typeof geminiAI.generateJSON !== 'function') {
  throw new Error('FactChecker requires a valid GeminiAI instance');
}
if (!sourceVerifier || typeof sourceVerifier.findAuthoritativeSources !== 'function') {
  throw new Error('FactChecker requires a valid SourceVerifier instance');
}
```

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

```
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
  console.error("Source analysis error:", error);
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
```

}

async performFinalVerification(claim, sourceAnalysis) {
try {
console.log(`Performing final verification with consensus: ${sourceAnalysis.consensus}`);

```
  const systemPrompt = `
```

You are making a final determination about a factual claim based on source analysis.

Status options (be VERY conservative):

- “verified”: Claim is clearly supported by multiple reliable sources
- “false”: Claim is clearly contradicted by multiple reliable sources
- “unverified”: Insufficient evidence, conflicting sources, or low confidence
- “partially_true”: Some aspects are accurate, others are not
- “misleading”: Technically accurate but missing crucial context

CRITICAL GUIDELINES:

- Only use “false” when you have HIGH CONFIDENCE (>0.8) and strong evidence
- When in doubt, use “unverified” to avoid false positives
- Consider source quality, quantity, and consensus
- Account for potential bias in sources
- Be extra cautious with controversial topics

You must respond with valid JSON only:
{
“status”: “verified|false|unverified|partially_true|misleading”,
“confidence”: 0.0-1.0,
“reasoning”: “detailed explanation of your decision”,
“recommendations”: [“specific suggestions for the user”],
“evidence_strength”: “strong|moderate|weak|insufficient”,
“certainty_factors”: [“factors that increase or decrease certainty”]
}
`;

```
  const analysisDetails = {
    consensus: sourceAnalysis.consensus,
    supporting_count: sourceAnalysis.supporting_count,
    refuting_count: sourceAnalysis.refuting_count,
    source_quality: sourceAnalysis.source_quality,
    confidence: sourceAnalysis.confidence,
    credible_sources: sourceAnalysis.credible_sources || 0,
    analysis: sourceAnalysis.analysis
  };

  const prompt = `
```

Claim to verify: “${claim}”

Source Analysis Results:
${JSON.stringify(analysisDetails, null, 2)}

Make your final determination about this claim.
`;

```
  const response = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  // Validate and enhance response
  const result = {
    status: String(response.status || 'unverified'),
    confidence: Math.max(0, Math.min(1, Number(response.confidence) || 0.3)),
    reasoning: String(response.reasoning || 'Final verification completed'),
    recommendations: Array.isArray(response.recommendations) ? response.recommendations : ['Verify with additional sources'],
    evidence_strength: String(response.evidence_strength || 'insufficient'),
    certainty_factors: Array.isArray(response.certainty_factors) ? response.certainty_factors : []
  };

  // Apply conservative confidence adjustment
  if (result.status === 'false' && result.confidence < 0.8) {
    console.log(`Adjusting "false" status to "unverified" due to low confidence (${result.confidence})`);
    result.status = 'unverified';
    result.reasoning += ' (Confidence too low for definitive false determination)';
    result.confidence = Math.min(result.confidence, 0.6);
  }

  // Validate status values
  const validStatuses = ['verified', 'false', 'unverified', 'partially_true', 'misleading'];
  if (!validStatuses.includes(result.status)) {
    console.warn(`Invalid status "${result.status}", defaulting to unverified`);
    result.status = 'unverified';
    result.confidence = Math.min(result.confidence, 0.4);
  }

  console.log(`Final verification: Status=${result.status}, Confidence=${result.confidence}, Evidence=${result.evidence_strength}`);
  
  return result;
} catch (error) {
  console.error("Final verification error:", error);
  return {
    status: 'error',
    confidence: 0,
    reasoning: `Unable to complete verification: ${error.message}`,
    recommendations: ['Please verify manually with trusted sources'],
    evidence_strength: 'insufficient',
    certainty_factors: ['Technical error occurred']
  };
}
```

}

// Utility method for batch verification
async verifyMultipleClaims(claims) {
console.log(`Starting batch verification of ${claims.length} claims`);
const results = [];

```
for (const claim of claims) {
  try {
    const result = await this.verifyClaimMultiStep(claim);
    results.push(result);
    
    // Add small delay to avoid overwhelming APIs
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error(`Batch verification error for claim "${claim}":`, error);
    results.push({
      claim,
      status: 'error',
      confidence: 0,
      sources: [],
      reasoning: 'Batch verification failed',
      verification_steps: ['error'],
      timestamp: new Date().toISOString()
    });
  }
}

console.log(`Batch verification complete: ${results.length} results`);
return results;
```

}

// Health check method
async healthCheck() {
try {
// Test with a simple, obviously true claim
const testClaim = “Water is composed of hydrogen and oxygen atoms”;
const result = await this.checkPlausibility(testClaim);

```
  return {
    status: 'healthy',
    gemini_ai: !!this.geminiAI,
    source_verifier: !!this.sourceVerifier,
    cache_manager: !!this.cacheManager,
    error_handler: !!this.errorHandler,
    test_result: result.obviously_true ? 'passed' : 'warning'
  };
} catch (error) {
  return {
    status: 'unhealthy',
    error: error.message,
    timestamp: new Date().toISOString()
  };
}
```

}
}

module.exports = FactChecker;error) {
if (this.errorHandler) {
const handledError = await this.errorHandler.handleError(error, {
service: ‘factChecker’,
operation: ‘verifyClaimMultiStep’,
claim: claim.substring(0, 100)
});

```
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
```

}

async handleStep(stepFunction, stepName, claim) {
try {
console.log(`Executing step: ${stepName}`);

```
  if (this.errorHandler) {
    return await this.errorHandler.handleError(
      stepFunction,
      {
        service: 'factChecker',
        operation: stepName,
        claim: claim?.substring(0, 50) || 'undefined',
        useCache: true,
        cacheManager: this.cacheManager
      },
      () => this.getStepFallback(stepName)
    );
  } else {
    const result = await stepFunction();
    console.log(`Step ${stepName} completed successfully`);
    return result;
  }
} catch (error) {
  console.error(`Step ${stepName} failed:`, error.message);
  return this.getStepFallback(stepName);
}
```

}

getStepFallback(stepName) {
switch (stepName) {
case ‘plausibility_check’:
return {
obviously_true: false,
obviously_false: false,
requires_investigation: true,
confidence: 0.5,
reasoning: “Unable to perform plausibility check”
};
case ‘source_search’:
return [];
case ‘source_analysis’:
return {
consensus: ‘insufficient_sources’,
supporting_count: 0,
refuting_count: 0,
neutral_count: 0,
confidence: 0.1
};
case ‘final_verification’:
return {
status: ‘unverified’,
confidence: 0.3,
reasoning: ‘Unable to complete verification due to service issues’,
recommendations: [‘Please verify with additional sources’]
};
default:
return null;
}
}

async checkPlausibility(claim) {
try {
console.log(`Checking plausibility for: "${claim.substring(0, 100)}..."`);

```
  const systemPrompt = `
```

You are a fact-checking expert performing initial plausibility assessment.

Evaluate if this claim is:

1. Obviously true - undisputed common knowledge that doesn’t need sources
1. Obviously false - contradicts well-established facts
1. Requires investigation - needs source verification

Examples of OBVIOUSLY TRUE: “Water boils at 100°C at sea level”, “The Earth is round”
Examples of OBVIOUSLY FALSE: “The moon is made of cheese”, “Humans can breathe underwater”
Most claims should REQUIRE INVESTIGATION.

You must respond with valid JSON only:
{
“obviously_true”: boolean,
“obviously_false”: boolean,
“requires_investigation”: boolean,
“confidence”: 0.0-1.0,
“reasoning”: “clear explanation of your assessment”,
“category”: “scientific|historical|common_knowledge|complex|controversial”
}

Be conservative - when in doubt, mark as requires_investigation.
`;

```
  const prompt = `Evaluate this claim for plausibility: "${claim}"`;
  const response = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  // Validate response structure
  if (typeof response !== 'object' || response === null) {
    throw new Error('Invalid JSON response from Gemini AI');
  }

  // Ensure all required fields are present with defaults
  const result = {
    obviously_true: Boolean(response.obviously_true),
    obviously_false: Boolean(response.obviously_false),
    requires_investigation: Boolean(response.requires_investigation !== false), // Default to true
    confidence: Math.max(0, Math.min(1, Number(response.confidence) || 0.5)),
    reasoning: String(response.reasoning || "Plausibility assessment completed"),
    category: String(response.category || "unknown")
  };

  // Logical validation - exactly one should be true
  const trueCount = [result.obviously_true, result.obviously_false, result.requires_investigation].filter(Boolean).length;
  if (trueCount !== 1) {
    console.warn('Plausibility check returned invalid combination, defaulting to requires_investigation');
    result.obviously_true = false;
    result.obviously_false = false;
    result.requires_investigation = true;
    result.confidence = Math.min(result.confidence, 0.5);
  }

  console.log(`Plausibility result: ${result.obviously_true ? 'OBVIOUSLY_TRUE' : result.obviously_false ? 'OBVIOUSLY_FALSE' : 'REQUIRES_INVESTIGATION'} (confidence: ${result.confidence})`);
  
  return result;
} catch (error) {
  console.error("Plausibility check error:", error);
  return {
    obviously_true: false,
    obviously_false: false,
    requires_investigation: true,
    confidence: 0.3,
    reasoning: `Unable to perform plausibility check: ${error.message}`,
    category: "error"
  };
}
```

}

async analyzeSources(claim, sources) {
if (!sources || sources.length === 0) {
console.log(‘No sources available for analysis’);
return {
consensus: ‘insufficient_sources’,
supporting_count: 0,
refuting_count: 0,
neutral_count: 0,
confidence: 0.1,
source_quality: ‘none’,
analysis: ‘No sources available for analysis’
};
}

```
try {
  console.log(`Analyzing ${sources.length} sources for consensus`);
  
  // Prepare source information for analysis
  const sourceTexts = sources.map((s, index) => {
    const content = s.content || s.snippet || s.description || '';
    return `Source ${index + 1}:
```

Title: ${s.title || ‘Unknown’}
URL: ${s.url || ‘Unknown’}
Domain: ${s.domain || ‘Unknown’}
Credibility Score: ${s.credibilityScore || ‘Unknown’}
Content: ${content.substring(0, 1000)}${content.length > 1000 ? ‘…’ : ‘’}
—`;
}).join(’\n\n’);

```
  const systemPrompt = `
```

You are analyzing sources to determine their stance on a factual claim.

For each source, determine if it:

- SUPPORTS the claim (provides evidence the claim is true)
- REFUTES the claim (provides evidence the claim is false)
- NEUTRAL (mentions the topic but doesn’t take a clear stance)

Consider:

- Source credibility and domain authority
- Quality and depth of evidence presented
- Potential bias or agenda
- Recency and relevance of information

You must respond with valid JSON only:
{
“consensus”: “supports|refutes|mixed|insufficient”,
“supporting_count”: number,
“refuting_count”: number,
“neutral_count”: number,
“confidence”: 0.0-1.0,
“source_quality”: “high|medium|low”,
“analysis”: “detailed explanation of findings”,
“credible_sources”: number,
“conflicting_evidence”: boolean
}
`;

```
  const prompt = `Claim to verify: "${claim}"\n\nSources to analyze:\n${sourceTexts}`;
  const response = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  // Validate and sanitize response
  const result = {
    consensus: String(response.consensus || 'insufficient'),
    supporting_count: Math.max(0, parseInt(response.supporting_count) || 0),
    refuting_count: Math.max(0, parseInt(response.refuting_count) || 0),
    neutral_count: Math.max(0, parseInt(response.neutral_count) || 0),
    confidence: Math.max(0, Math.min(1, Number(response.confidence) || 0.3)),
    source_quality: String(response.source_quality || 'medium'),
    analysis: String(response.analysis || 'Source analysis completed'),
    credible_sources: Math.max(0, parseInt(response.credible_sources) || sources.length),
    conflicting_evidence: Boolean(response.conflicting_evidence)
  };

  // Validate counts don't exceed total sources
  const totalCounted = result.supporting_count + result.refuting_count + result.neutral_count;
  if (totalCounted > sources.length) {
    console.warn(`Source count mismatch: counted ${totalCounted}, have ${sources.length} sources`);
    const ratio = sources.length / totalCounted;
    result.supporting_count = Math.floor(result.supporting_count * ratio);
    result.refuting_count = Math.floor(result.refuting_count * ratio);
    result.neutral_count = sources.length - result.supporting_count - result.refuting_count;
  }

  console.log(`Source analysis: ${result.supporting_count} support, ${result.refuting_count} refute, ${result.neutral_count} neutral`);
  
  return result;
} catch (error) {
  console.error("Source analysis error:", error);
  return {
    consensus: 'error',
    supporting_count: 0,
    refuting_count: 0,
    neutral_count: sources.length,
    confidence: 0.1,
    source_quality: 'unknown',
    analysis: `Error analyzing sources: ${error.message}`,
    credible_sources: 0,
    conflicting_evidence: false
  };
}
```

}
} catch (
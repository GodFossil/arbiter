class ConfidenceScorer {
constructor(geminiAI) {
this.geminiAI = geminiAI;
}

async analyzeResults(factCheckResults, contradictions) {
try {
const systemPrompt = `
You are an expert at analyzing fact-checking results to determine if misinformation should be flagged.

CRITICAL: Use VERY HIGH standards before recommending to flag content. Only flag if:

1. Multiple reliable sources clearly contradict the claim
1. The misinformation could seriously mislead people
1. The evidence is overwhelming and unambiguous
1. You have very high confidence (>0.8) in the assessment

When in doubt, DO NOT flag to avoid false positives.

Consider:

- Quality and quantity of sources
- Severity of contradictions
- Potential for harm if misinformation spreads
- Certainty of the evidence

You must respond with valid JSON only:
{
“should_flag”: boolean,
“confidence”: 0.0-1.0,
“flag_type”: “misinformation|contradiction|unverified”,
“reason”: “detailed explanation”,
“sources”: [“array of best source URLs”],
“explanation”: “brief explanation for the user”,
“educational_response”: “helpful, non-confrontational educational message”,
“severity”: 1-10,
“harm_potential”: “low|medium|high”
}

Only set should_flag to true if confidence > 0.8 AND the misinformation could cause harm.
`;

```
  const prompt = `
```

Fact-check results: ${JSON.stringify(factCheckResults, null, 2)}

Contradictions: ${JSON.stringify(contradictions, null, 2)}

Should this be flagged as misinformation?
`;

```
  const result = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  // Additional safety check - only flag with very high confidence
  if (result.should_flag && result.confidence < 0.8) {
    result.should_flag = false;
    result.reason += " (Lowered flag due to insufficient confidence)";
  }

  // Ensure sources array exists
  if (!result.sources) {
    result.sources = [];
  }

  return result;
} catch (error) {
  console.error("Confidence scoring error:", error);
  return {
    should_flag: false,
    confidence: 0,
    flag_type: "error",
    reason: "Unable to analyze results",
    sources: [],
    explanation: "Analysis unavailable",
    educational_response: "I encountered an issue while analyzing this information.",
    severity: 1,
    harm_potential: "low"
  };
}
```

}

calculateOverallConfidence(factCheckResults, contradictions, sourceCredibility) {
let totalConfidence = 0;
let factorCount = 0;

```
// Factor in fact-check results
if (factCheckResults && factCheckResults.length > 0) {
  const avgFactCheckConfidence = factCheckResults.reduce((sum, result) => 
    sum + (result.confidence || 0), 0) / factCheckResults.length;
  totalConfidence += avgFactCheckConfidence;
  factorCount++;
}

// Factor in contradiction strength
if (contradictions && contradictions.length > 0) {
  const avgContradictionConfidence = contradictions.reduce((sum, contradiction) => 
    sum + (contradiction.confidence || 0), 0) / contradictions.length;
  totalConfidence += avgContradictionConfidence;
  factorCount++;
}

// Factor in source credibility
if (sourceCredibility && sourceCredibility.overall_credibility) {
  totalConfidence += sourceCredibility.overall_credibility;
  factorCount++;
}

return factorCount > 0 ? totalConfidence / factorCount : 0;
```

}

determineActionThreshold(confidence, severity) {
// Very conservative thresholds to prevent false positives
if (confidence >= 0.9 && severity >= 8) return ‘immediate_flag’;
if (confidence >= 0.8 && severity >= 6) return ‘flag_with_sources’;
if (confidence >= 0.7 && severity >= 4) return ‘educational_note’;
return ‘no_action’;
}

async assessClaimSeverity(claim, factCheckResult) {
try {
const systemPrompt = `
Assess the potential severity and harm of this misinformation claim.

Consider:

- Health and safety implications
- Economic impact potential
- Political/social divisiveness
- Scientific misinformation spread
- Impact on vulnerable populations

You must respond with valid JSON only:
{
“severity”: 1-10,
“harm_potential”: “low|medium|high”,
“categories”: [“health”, “economic”, “political”, “scientific”, “social”],
“vulnerable_groups”: [“groups that might be particularly affected”],
“urgency”: “low|medium|high”,
“reasoning”: “explanation of severity assessment”
}
`;

```
  const prompt = `
```

Claim: “${claim}”
Fact-check result: ${JSON.stringify(factCheckResult, null, 2)}

Assess the severity and potential harm of this misinformation.
`;

```
  const result = await this.geminiAI.generateJSON(prompt, systemPrompt);
  return result;

} catch (error) {
  console.error("Severity assessment error:", error);
  return {
    severity: 3,
    harm_potential: "low",
    categories: ["general"],
    vulnerable_groups: [],
    urgency: "low",
    reasoning: "Unable to assess severity"
  };
}
```

}

async generateEducationalResponse(claim, factCheckResult, sources) {
try {
const systemPrompt = `
Generate a helpful, educational response about this misinformation that:

1. Is non-confrontational and respectful
1. Focuses on media literacy and critical thinking
1. Provides constructive guidance
1. Encourages source verification
1. Maintains a helpful tone

Do NOT:

- Directly attack the user
- Be condescending or preachy
- Use accusatory language
- Make the user feel bad

Generate a friendly, educational message that helps improve information quality.
`;

```
  const sourceList = sources.slice(0, 3).map(s => `• ${s.title}: ${s.url}`).join('\n');
  
  const prompt = `
```

Claim being addressed: “${claim}”
Fact-check findings: ${factCheckResult.reasoning || ‘Contradicted by reliable sources’}
Available sources:
${sourceList}

Generate a helpful educational response.
`;

```
  const response = await this.geminiAI.generateBackground(prompt, systemPrompt);
  return response;

} catch (error) {
  console.error("Educational response generation error:", error);
  return "I found some information that might be helpful to verify. Consider checking multiple reliable sources when evaluating claims.";
}
```

}

async compareSources(sources) {
try {
const systemPrompt = `
Compare these sources for credibility and consensus.

You must respond with valid JSON only:
{
“consensus_strength”: 0.0-1.0,
“source_quality”: “high|medium|low”,
“conflicting_sources”: number,
“supporting_sources”: number,
“credibility_issues”: [“list of any credibility concerns”],
“recommendation”: “high_confidence|moderate_confidence|low_confidence|insufficient”
}
`;

```
  const sourcesText = sources.map(s => 
    `Title: ${s.title}\nURL: ${s.url}\nDomain: ${s.domain}\nCredibility: ${s.credibilityScore}`
  ).join('\n\n');

  const prompt = `Analyze these sources for credibility and consensus:\n\n${sourcesText}`;
  const result = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  return result;

} catch (error) {
  console.error("Source comparison error:", error);
  return {
    consensus_strength: 0.5,
    source_quality: "medium",
    conflicting_sources: 0,
    supporting_sources: sources.length,
    credibility_issues: [],
    recommendation: "moderate_confidence"
  };
}
```

}
}

module.exports = ConfidenceScorer;
class ClaimExtractor {
constructor(geminiAI, errorHandler = null) {
this.geminiAI = geminiAI;
this.errorHandler = errorHandler;
}

async extractClaims(messageContent) {
try {
// Pre-filter messages that are unlikely to contain factual claims
if (this.shouldSkipMessage(messageContent)) {
return [];
}

```
  const systemPrompt = `
```

You are an expert at identifying verifiable factual claims in text.

Extract only claims that are:

1. Factual statements that can be verified
1. Specific enough to fact-check
1. Not obvious opinions, questions, or sarcasm
1. Not hypothetical scenarios or “what if” statements

Do NOT extract:

- Personal opinions (“I think”, “I believe”)
- Obvious sarcasm or jokes
- Questions
- Hypothetical statements
- Common knowledge facts
- Personal experiences
- Greetings or casual chat

You must respond with valid JSON only:
{
“claims”: [
{
“claim”: “exact claim text”,
“confidence”: 0.0-1.0,
“reasoning”: “why this is worth fact-checking”
}
],
“total_claims”: number,
“analysis”: “brief analysis of the message”
}

If no verifiable claims are found, return an empty claims array.
`;

```
  const prompt = `Extract verifiable factual claims from this message:\n\n"${messageContent}"`;
  const response = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  // Filter claims by confidence threshold
  const highConfidenceClaims = response.claims
    .filter(claim => claim.confidence >= 0.6)
    .map(claim => claim.claim);

  console.log(`Extracted ${highConfidenceClaims.length} high-confidence claims from message`);
  
  return highConfidenceClaims;

} catch (error) {
  if (this.errorHandler) {
    await this.errorHandler.handleError(error, {
      service: 'claimExtractor',
      operation: 'extractClaims',
      messageContent: messageContent.substring(0, 100)
    });
  } else {
    console.error("Claim extraction error:", error);
  }
  
  // Return empty array on error to prevent downstream issues
  return [];
}
```

}

async extractClaimsWithContext(messageContent, channelContext = []) {
try {
if (this.shouldSkipMessage(messageContent)) {
return [];
}

```
  const contextText = channelContext
    .slice(-10)
    .map(msg => `${msg.username}: ${msg.content}`)
    .join('\n');

  const systemPrompt = `
```

You are an expert at identifying verifiable factual claims in Discord conversations.

Consider the conversation context to understand:

- Whether statements are serious claims or casual chat
- If claims are being made in response to previous messages
- The overall tone and purpose of the discussion

Extract only claims that are:

1. Factual statements that can be verified against authoritative sources
1. Specific enough to fact-check (not vague generalizations)
1. Presented as factual information (not obvious opinions)
1. Worth fact-checking given the conversation context

You must respond with valid JSON only:
{
“claims”: [
{
“claim”: “exact claim text”,
“confidence”: 0.0-1.0,
“context_relevance”: 0.0-1.0,
“reasoning”: “why this is worth fact-checking”
}
],
“conversation_analysis”: “analysis of the conversation tone and purpose”
}
`;

```
  const prompt = `
```

Recent conversation context:
${contextText}

Current message to analyze:
“${messageContent}”

Extract verifiable factual claims considering the conversation context.
`;

```
  const response = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  // Filter claims by both confidence and context relevance
  const relevantClaims = response.claims
    .filter(claim => claim.confidence >= 0.6 && claim.context_relevance >= 0.5)
    .map(claim => claim.claim);

  console.log(`Extracted ${relevantClaims.length} contextually relevant claims`);
  
  return relevantClaims;

} catch (error) {
  if (this.errorHandler) {
    await this.errorHandler.handleError(error, {
      service: 'claimExtractor',
      operation: 'extractClaimsWithContext',
      messageContent: messageContent.substring(0, 100)
    });
  } else {
    console.error("Contextual claim extraction error:", error);
  }
  
  // Fallback to basic extraction
  return await this.extractClaims(messageContent);
}
```

}

shouldSkipMessage(messageContent) {
const content = messageContent.toLowerCase().trim();

```
// Skip very short messages
if (content.length < 20) return true;

// Skip messages that are clearly not factual claims
const skipPatterns = [
  /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|lol|lmao|wtf)/,
  /\?.*\?/, // Multiple questions
  /^(i think|i believe|i feel|imo|in my opinion)/,
  /^(what if|imagine if|suppose|let's say)/,
  /\b(probably|maybe|perhaps|might|could be)\b/,
  /^(good morning|good night|see you|bye|goodbye)/,
  /@everyone|@here/, // Announcements
  /^!/, // Bot commands
];

return skipPatterns.some(pattern => pattern.test(content));
```

}

async categorizeClaimType(claim) {
try {
const systemPrompt = `
Categorize this factual claim by type to help with verification strategy.

Categories:

- “scientific”: Scientific facts, research findings, health claims
- “historical”: Historical events, dates, biographical information
- “statistical”: Numbers, percentages, data claims
- “current_events”: Recent news, political developments
- “economic”: Financial data, market information, economic claims
- “geographical”: Location-based facts, demographics
- “technical”: Technology, engineering, specifications
- “general”: Other factual claims

You must respond with valid JSON only:
{
“category”: “category name”,
“confidence”: 0.0-1.0,
“verification_strategy”: “suggested approach for fact-checking”,
“complexity”: “low|medium|high”
}
`;

```
  const prompt = `Categorize this claim: "${claim}"`;
  const response = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  return response;

} catch (error) {
  console.error("Claim categorization error:", error);
  return {
    category: "general",
    confidence: 0.5,
    verification_strategy: "standard fact-checking",
    complexity: "medium"
  };
}
```

}

async prioritizeClaims(claims) {
if (claims.length <= 1) return claims;

```
try {
  const systemPrompt = `
```

Prioritize these factual claims for fact-checking based on:

1. Potential for harm if misinformation spreads
1. Likelihood of being false or misleading
1. Public interest and importance
1. Verifiability with available sources

You must respond with valid JSON only:
{
“prioritized_claims”: [
{
“claim”: “exact claim text”,
“priority_score”: 0.0-1.0,
“reasoning”: “why this priority level”
}
]
}

Return claims ordered by priority (highest first).
`;

```
  const claimsText = claims.map((claim, index) => `${index + 1}. ${claim}`).join('\n');
  const prompt = `Prioritize these claims for fact-checking:\n\n${claimsText}`;
  
  const response = await this.geminiAI.generateJSON(prompt, systemPrompt);
  
  return response.prioritized_claims
    .sort((a, b) => b.priority_score - a.priority_score)
    .map(item => item.claim);

} catch (error) {
  console.error("Claim prioritization error:", error);
  return claims; // Return original order on error
}
```

}
}

module.exports = ClaimExtractor;
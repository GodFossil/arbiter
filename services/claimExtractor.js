class ClaimExtractor {
  constructor(openai) {
    this.openai = openai;
    this.model = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  }

  async extractClaims(text) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
You are an expert at identifying factual claims in text. Extract only verifiable factual statements that can be fact-checked.

IMPORTANT: Only extract claims that are:
1. Factual assertions (not opinions, preferences, or subjective statements)
2. Specific enough to be verified
3. Not obviously sarcastic or hypothetical
4. About objective reality (not personal experiences unless they involve verifiable facts)

Examples of what TO extract:
- "The Earth is flat"
- "Vaccines cause autism"
- "The capital of France is Berlin"
- "Climate change is not real"

Examples of what NOT to extract:
- "I think pizza is better than burgers" (opinion)
- "I went to the store yesterday" (personal experience)
- "What if aliens existed?" (hypothetical)
- "LOL the Earth is totally flat" (obviously sarcastic)

Respond with a JSON object containing an array of claims:
{ "claims": ["claim1", "claim2", ...] }

If no factual claims are found, respond with:
{ "claims": [] }
            `.trim(),
          },
          {
            role: "user",
            content: `Extract factual claims from this text: "${text}"`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.claims || [];
    } catch (error) {
      console.error("Claim extraction error:", error);
      return [];
    }
  }

  async categorizeClaims(claims) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Categorize these factual claims by type and verifiability difficulty.

Categories:
- "scientific": Claims about scientific facts, research, health, etc.
- "historical": Claims about past events, dates, people
- "statistical": Claims involving numbers, percentages, quantities
- "geographical": Claims about locations, places, countries
- "current_events": Claims about recent news or ongoing situations
- "other": Any other factual claims

Difficulty levels:
- "easy": Easily verifiable from authoritative sources
- "moderate": Requires some research but verifiable
- "difficult": Complex or nuanced claims requiring expert analysis

Respond with JSON:
{
  "categorized_claims": [
    {
      "claim": "claim text",
      "category": "category",
      "difficulty": "difficulty_level",
      "priority": 1-10
    }
  ]
}
            `.trim(),
          },
          {
            role: "user",
            content: `Categorize these claims: ${JSON.stringify(claims)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.categorized_claims || [];
    } catch (error) {
      console.error("Claim categorization error:", error);
      return claims.map(claim => ({
        claim,
        category: "other",
        difficulty: "moderate",
        priority: 5
      }));
    }
  }
}

module.exports = ClaimExtractor;

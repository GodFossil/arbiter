class ContradictionDetector {
  constructor(openai) {
    this.openai = openai;
    this.model = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  }

  async detectContradictions(claims, userContext) {
    if (!claims || claims.length === 0 || !userContext || userContext.length === 0) {
      return [];
    }

    try {
      // Extract previous statements from user context
      const previousStatements = userContext
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .slice(-20); // Last 20 user messages

      if (previousStatements.length === 0) {
        return [];
      }

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
You are an expert at detecting logical contradictions and inconsistencies in statements.

Analyze the current claims against the user's previous statements to identify contradictions.

IMPORTANT: Only flag TRUE contradictions where:
1. The statements are about the same topic/entity
2. They make opposing factual claims
3. They cannot both be true simultaneously
4. The contradiction is clear and unambiguous

DO NOT flag:
- Changes of opinion over time (people can change their minds)
- Different topics that happen to use similar words
- Statements that are just different but not contradictory
- Sarcasm, jokes, or hypothetical statements
- Personal preferences vs factual claims

Respond with JSON:
{
  "contradictions": [
    {
      "current_claim": "the new claim",
      "previous_statement": "the contradicting previous statement",
      "contradiction_type": "factual|logical|temporal",
      "severity": "high|medium|low",
      "confidence": 0.0-1.0,
      "explanation": "why this is a contradiction"
    }
  ]
}
            `.trim(),
          },
          {
            role: "user",
            content: `
Current claims: ${JSON.stringify(claims)}

Previous statements:
${previousStatements.map((stmt, i) => `${i + 1}. ${stmt}`).join('\n')}

Detect any contradictions between current claims and previous statements.
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.contradictions || [];
    } catch (error) {
      console.error("Contradiction detection error:", error);
      return [];
    }
  }

  async analyzeContradictionSeverity(contradictions) {
    if (!contradictions || contradictions.length === 0) {
      return { shouldFlag: false, totalSeverity: 0 };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Analyze the severity and importance of these detected contradictions.

Consider:
- Are these contradictions about important factual matters?
- Could they mislead others in a debate context?
- Are they clear-cut contradictions or edge cases?
- Would flagging this help maintain debate integrity?

Respond with JSON:
{
  "should_flag": boolean,
  "total_severity": 0-10,
  "most_serious": "description of most serious contradiction",
  "reasoning": "why this should or shouldn't be flagged"
}
            `.trim(),
          },
          {
            role: "user",
            content: `Contradictions to analyze: ${JSON.stringify(contradictions, null, 2)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return {
        shouldFlag: result.should_flag || false,
        totalSeverity: result.total_severity || 0,
        mostSerious: result.most_serious || "",
        reasoning: result.reasoning || ""
      };
    } catch (error) {
      console.error("Contradiction severity analysis error:", error);
      return { shouldFlag: false, totalSeverity: 0 };
    }
  }
}

module.exports = ContradictionDetector;

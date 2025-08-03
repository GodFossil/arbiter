class ConfidenceScorer {
  constructor(openai) {
    this.openai = openai;
    this.model = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  }

  async analyzeResults(factCheckResults, contradictions) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
You are an expert at analyzing fact-checking results to determine if misinformation should be flagged.

CRITICAL: Use VERY HIGH standards before recommending to flag content. Only flag if:
1. Multiple reliable sources clearly contradict the claim
2. The misinformation could seriously mislead people
3. The evidence is overwhelming and unambiguous
4. You have very high confidence (>0.8) in the assessment

When in doubt, DO NOT flag to avoid false positives.

Consider:
- Quality and quantity of sources
- Severity of contradictions
- Potential for harm if misinformation spreads
- Certainty of the evidence

Respond with JSON:
{
  "should_flag": boolean,
  "confidence": 0.0-1.0,
  "flag_type": "misinformation|contradiction|unverified",
  "reason": "detailed explanation",
  "sources": "array of best sources",
  "explanation": "brief explanation for the user", 
  "educational_response": "helpful, non-confrontational educational message"
}

Only set should_flag to true if confidence > 0.8 AND the misinformation is clearly harmful.
            `.trim(),
          },
          {
            role: "user",
            content: `
Fact-check results: ${JSON.stringify(factCheckResults, null, 2)}

Contradictions: ${JSON.stringify(contradictions, null, 2)}

Should this be flagged as misinformation?
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Additional safety check - only flag with very high confidence
      if (result.should_flag && result.confidence < 0.8) {
        result.should_flag = false;
        result.reason += " (Lowered flag due to insufficient confidence)";
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
        educational_response: "I encountered an issue while analyzing this information."
      };
    }
  }

  calculateOverallConfidence(factCheckResults, contradictions, sourceCredibility) {
    let totalConfidence = 0;
    let factorCount = 0;

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
  }

  determineActionThreshold(confidence, severity) {
    // Very conservative thresholds to prevent false positives
    if (confidence >= 0.9 && severity >= 8) return 'immediate_flag';
    if (confidence >= 0.8 && severity >= 6) return 'flag_with_sources';
    if (confidence >= 0.7 && severity >= 4) return 'educational_note';
    return 'no_action';
  }
}

module.exports = ConfidenceScorer;

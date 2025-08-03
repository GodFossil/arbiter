class InteractiveVerifier {
  constructor(openai, factChecker, sourceVerifier, cacheManager = null) {
    this.openai = openai;
    this.factChecker = factChecker;
    this.sourceVerifier = sourceVerifier;
    this.cacheManager = cacheManager;
    this.model = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    this.pendingInteractions = new Map(); // Store pending user interactions
  }

  async handleInteractiveRequest(message, requestType, originalAnalysis = null) {
    const userId = message.author.id;
    const channelId = message.channel.id;
    const interactionId = `${userId}-${Date.now()}`;

    try {
      switch (requestType.toLowerCase()) {
        case 'explain':
          return await this.explainConfidenceReasoning(originalAnalysis, message);
        
        case 'deeper':
        case 'detailed':
          return await this.performDeeperAnalysis(message.content, originalAnalysis);
        
        case 'sources':
          return await this.provideBetterSources(originalAnalysis, message);
        
        case 'challenge':
          return await this.allowChallenge(originalAnalysis, message);
        
        case 'alternative':
          return await this.findAlternativePerspectives(originalAnalysis, message);
        
        default:
          return await this.handleGeneralInquiry(message, originalAnalysis);
      }
    } catch (error) {
      console.error('Interactive verification error:', error);
      return this.getErrorResponse();
    }
  }

  async explainConfidenceReasoning(analysis, message) {
    if (!analysis) {
      return "I don't have a previous analysis to explain. Could you specify which claim you'd like me to analyze?";
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
You are explaining the reasoning behind a fact-check confidence score to a user.

Break down the confidence calculation in simple, clear terms. Explain:
1. What factors contributed to the confidence score
2. Why certain sources were weighted more heavily
3. What uncertainties or limitations existed
4. How the threshold system works
5. What would change the confidence score

Be educational and transparent, not defensive. Help the user understand the process.
            `.trim(),
          },
          {
            role: "user",
            content: `
Original Analysis:
${JSON.stringify(analysis, null, 2)}

User is asking for an explanation of why the confidence was ${Math.round(analysis.confidence * 100)}% for their fact-check.

Provide a clear, educational explanation of the reasoning process.
            `,
          },
        ],
        temperature: 0.2,
      });

      const explanation = response.choices[0].message.content;

      return `🔍 **Confidence Explanation** (${Math.round(analysis.confidence * 100)}%)\n\n${explanation}\n\n*Would you like me to perform a deeper analysis or find additional sources?*`;

    } catch (error) {
      console.error('Confidence explanation error:', error);
      return "I encountered an issue explaining the confidence reasoning. The confidence score was based on source credibility, claim specificity, and evidence consistency.";
    }
  }

  async performDeeperAnalysis(originalClaim, previousAnalysis) {
    try {
      // Extract claims if not already done
      const claims = previousAnalysis?.claims || [originalClaim];
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Perform a deeper, more thorough fact-checking analysis. Go beyond the initial assessment by:

1. Breaking down complex claims into sub-components
2. Examining historical context and precedents  
3. Looking for nuanced evidence that might have been missed
4. Considering edge cases and exceptions
5. Analyzing methodology of cited studies
6. Checking for recent developments or updates
7. Examining potential biases in sources

Provide comprehensive analysis in this JSON format:
{
  "deeper_analysis": {
    "claim_breakdown": ["sub-claim1", "sub-claim2"],
    "historical_context": "relevant background",
    "recent_developments": "any new information",
    "methodology_review": "assessment of research methods",
    "bias_analysis": "potential source biases identified",
    "confidence_factors": {
      "strong_evidence": ["factor1", "factor2"],
      "weak_evidence": ["factor1", "factor2"],
      "uncertainties": ["uncertainty1", "uncertainty2"]
    },
    "updated_confidence": 0.0-1.0,
    "detailed_explanation": "comprehensive explanation",
    "recommendation": "final assessment"
  }
}
            `.trim(),
          },
          {
            role: "user",
            content: `
Original Claim: "${originalClaim}"

Previous Analysis:
${previousAnalysis ? JSON.stringify(previousAnalysis, null, 2) : 'No previous analysis'}

Perform a deeper, more comprehensive analysis of this claim.
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const deeperAnalysis = JSON.parse(response.choices[0].message.content);
      
      // Also perform additional source searches with different queries
      const alternativeQueries = await this.generateAlternativeSearchQueries(originalClaim);
      const additionalSources = [];
      
      for (const query of alternativeQueries.slice(0, 3)) {
        try {
          const sources = await this.sourceVerifier.webSearch.search(query, 5);
          additionalSources.push(...sources);
        } catch (error) {
          console.warn(`Additional search failed for query: ${query}`);
        }
      }

      return this.formatDeeperAnalysisResponse(deeperAnalysis, additionalSources);

    } catch (error) {
      console.error('Deeper analysis error:', error);
      return "I encountered an issue performing deeper analysis. Let me try a different approach or search for additional sources.";
    }
  }

  async generateAlternativeSearchQueries(claim) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Generate alternative search queries to find different perspectives on a claim.

Create queries that would find:
1. Supporting evidence
2. Contradicting evidence  
3. Academic research
4. Recent news/updates
5. Alternative interpretations

Respond with JSON:
{
  "queries": ["query1", "query2", "query3", "query4", "query5"]
}
            `.trim(),
          },
          {
            role: "user",
            content: `Generate alternative search queries for: "${claim}"`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.queries || [];
    } catch (error) {
      console.error('Alternative query generation error:', error);
      return [claim]; // Fallback to original claim
    }
  }

  async provideBetterSources(analysis, message) {
    try {
      const claims = analysis?.claims || [message.content];
      const betterSources = [];

      for (const claim of claims.slice(0, 2)) { // Limit to avoid rate limits
        const sources = await this.sourceVerifier.findAuthoritativeSources(claim, 8);
        betterSources.push(...sources);
      }

      // Rank sources by credibility and diversity
      const rankedSources = this.rankSourcesByQuality(betterSources);

      return this.formatSourcesResponse(rankedSources, analysis);

    } catch (error) {
      console.error('Better sources error:', error);
      return "I encountered an issue finding additional sources. Please try again or specify what type of sources you're looking for.";
    }
  }

  async allowChallenge(analysis, message) {
    const userId = message.author.id;
    const challengeId = `challenge-${userId}-${Date.now()}`;
    
    // Store the challenge for follow-up
    this.pendingInteractions.set(challengeId, {
      type: 'challenge',
      analysis: analysis,
      userId: userId,
      timestamp: Date.now()
    });

    return `🤔 **Challenge the Fact-Check**

I'm open to being challenged! Please provide:

1. **Specific Disagreement**: What exactly do you think is wrong?
2. **Your Evidence**: What sources or reasoning support your position?
3. **Context I Missed**: Any important context I might have overlooked?

I'll re-analyze the claim considering your input. Just reply with your challenge and I'll investigate further.

*This helps improve my accuracy - thank you for engaging constructively!*`;
  }

  async processChallengeResponse(challengeId, challengeText, message) {
    const challenge = this.pendingInteractions.get(challengeId);
    if (!challenge) {
      return "I don't have a record of this challenge. Please start a new challenge request.";
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
A user is challenging your fact-check analysis. Re-evaluate the original analysis considering their input.

Be objective and willing to revise your assessment if the user provides valid points. Consider:
1. Is their evidence credible?
2. Did you miss important context?
3. Are there alternative interpretations?
4. Should confidence be adjusted?

Respond with JSON:
{
  "challenge_assessment": {
    "user_points_valid": boolean,
    "missed_context": "what was overlooked",
    "revised_confidence": 0.0-1.0,
    "changes_made": ["change1", "change2"],
    "final_assessment": "updated conclusion",
    "acknowledgment": "acknowledge valid points raised"
  }
}
            `.trim(),
          },
          {
            role: "user",
            content: `
Original Analysis:
${JSON.stringify(challenge.analysis, null, 2)}

User's Challenge:
"${challengeText}"

Re-evaluate the analysis considering the user's challenge.
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const reassessment = JSON.parse(response.choices[0].message.content);
      
      // Clean up the pending interaction
      this.pendingInteractions.delete(challengeId);

      return this.formatChallengeResponse(reassessment);

    } catch (error) {
      console.error('Challenge processing error:', error);
      return "I encountered an issue processing your challenge. Your feedback is valuable - please try rephrasing your challenge.";
    }
  }

  async findAlternativePerspectives(analysis, message) {
    try {
      const claims = analysis?.claims || [message.content];
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Find alternative perspectives and viewpoints on the given claims. Present different angles fairly and objectively.

Consider:
1. Different expert opinions
2. Historical perspectives  
3. Cultural/regional differences
4. Methodological alternatives
5. Evolving scientific consensus
6. Minority expert views

Respond with JSON:
{
  "alternative_perspectives": [
    {
      "perspective": "name of viewpoint",
      "description": "detailed explanation",
      "supporting_evidence": ["evidence1", "evidence2"],
      "limitations": "limitations of this view",
      "credibility": 0.0-1.0
    }
  ],
  "synthesis": "balanced conclusion considering all perspectives"
}
            `.trim(),
          },
          {
            role: "user",
            content: `
Find alternative perspectives on these claims:
${claims.join(', ')}

Original Analysis Context:
${analysis ? JSON.stringify(analysis, null, 2) : 'No previous analysis'}
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const perspectives = JSON.parse(response.choices[0].message.content);
      return this.formatAlternativePerspectivesResponse(perspectives);

    } catch (error) {
      console.error('Alternative perspectives error:', error);
      return "I encountered an issue finding alternative perspectives. Different viewpoints on complex topics often exist - let me try a different approach.";
    }
  }

  // Helper formatting methods
  formatDeeperAnalysisResponse(analysis, additionalSources) {
    const deeper = analysis.deeper_analysis;
    let response = `🔬 **Deeper Analysis**\n\n`;
    
    if (deeper.claim_breakdown?.length > 0) {
      response += `**Sub-Claims Identified:**\n`;
      deeper.claim_breakdown.forEach((claim, i) => {
        response += `${i + 1}. ${claim}\n`;
      });
      response += `\n`;
    }

    if (deeper.confidence_factors) {
      response += `**Evidence Assessment:**\n`;
      if (deeper.confidence_factors.strong_evidence?.length > 0) {
        response += `✅ **Strong Evidence:** ${deeper.confidence_factors.strong_evidence.join(', ')}\n`;
      }
      if (deeper.confidence_factors.weak_evidence?.length > 0) {
        response += `⚠️ **Weak Evidence:** ${deeper.confidence_factors.weak_evidence.join(', ')}\n`;
      }
      if (deeper.confidence_factors.uncertainties?.length > 0) {
        response += `❓ **Uncertainties:** ${deeper.confidence_factors.uncertainties.join(', ')}\n`;
      }
      response += `\n`;
    }

    response += `**Updated Confidence:** ${Math.round(deeper.updated_confidence * 100)}%\n\n`;
    response += `${deeper.detailed_explanation}\n\n`;
    
    if (additionalSources.length > 0) {
      response += `**Additional Sources Found:**\n`;
      additionalSources.slice(0, 3).forEach((source, i) => {
        response += `${i + 1}. ${source.title} - ${source.url}\n`;
      });
    }

    return response;
  }

  formatSourcesResponse(sources, analysis) {
    let response = `📚 **Enhanced Source Analysis**\n\n`;
    
    const categorizedSources = this.categorizeSources(sources);
    
    Object.entries(categorizedSources).forEach(([category, categorySource]) => {
      if (categorySource.length > 0) {
        response += `**${category}:**\n`;
        categorySource.slice(0, 3).forEach((source, i) => {
          response += `${i + 1}. ${source.title}\n   ${source.url}\n   Credibility: ${Math.round(source.credibilityScore * 100)}%\n\n`;
        });
      }
    });

    return response;
  }

  formatChallengeResponse(reassessment) {
    const assessment = reassessment.challenge_assessment;
    let response = `🔄 **Challenge Response**\n\n`;
    
    if (assessment.acknowledgment) {
      response += `${assessment.acknowledgment}\n\n`;
    }
    
    if (assessment.changes_made?.length > 0) {
      response += `**Changes Made:**\n`;
      assessment.changes_made.forEach(change => {
        response += `• ${change}\n`;
      });
      response += `\n`;
    }
    
    response += `**Revised Confidence:** ${Math.round(assessment.revised_confidence * 100)}%\n\n`;
    response += `${assessment.final_assessment}\n\n`;
    response += `*Thank you for helping improve the analysis accuracy!*`;
    
    return response;
  }

  formatAlternativePerspectivesResponse(perspectives) {
    let response = `🔄 **Alternative Perspectives**\n\n`;
    
    perspectives.alternative_perspectives?.forEach((perspective, i) => {
      response += `**${i + 1}. ${perspective.perspective}**\n`;
      response += `${perspective.description}\n`;
      if (perspective.supporting_evidence?.length > 0) {
        response += `Evidence: ${perspective.supporting_evidence.join(', ')}\n`;
      }
      if (perspective.limitations) {
        response += `Limitations: ${perspective.limitations}\n`;
      }
      response += `\n`;
    });
    
    if (perspectives.synthesis) {
      response += `**Balanced Assessment:**\n${perspectives.synthesis}`;
    }
    
    return response;
  }

  // Utility methods
  rankSourcesByQuality(sources) {
    return sources
      .filter(source => source.credibilityScore > 0.3)
      .sort((a, b) => b.credibilityScore - a.credibilityScore)
      .slice(0, 10);
  }

  categorizeSources(sources) {
    const categories = {
      'Academic/Research': [],
      'News/Journalism': [],
      'Government/Official': [],
      'Expert Opinion': [],
      'Other': []
    };

    sources.forEach(source => {
      const domain = source.url.toLowerCase();
      if (domain.includes('.edu') || domain.includes('research') || domain.includes('journal')) {
        categories['Academic/Research'].push(source);
      } else if (domain.includes('.gov') || domain.includes('official')) {
        categories['Government/Official'].push(source);
      } else if (domain.includes('news') || domain.includes('times') || domain.includes('post')) {
        categories['News/Journalism'].push(source);
      } else {
        categories['Other'].push(source);
      }
    });

    return categories;
  }

  getErrorResponse() {
    return "I encountered an issue with your request. Please try rephrasing your question or specify what type of verification you'd like me to perform.";
  }

  // Clean up old pending interactions
  cleanupPendingInteractions() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [id, interaction] of this.pendingInteractions.entries()) {
      if (now - interaction.timestamp > maxAge) {
        this.pendingInteractions.delete(id);
      }
    }
  }
}

module.exports = InteractiveVerifier;
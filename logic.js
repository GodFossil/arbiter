/**
 * Advanced logical reasoning framework for Arbiter
 * Provides context-aware logical principles and reasoning enhancement
 */

const { logic: logger } = require('./logger');

// Core logical laws and principles
const FOUNDATIONAL_LOGIC = {
  nonContradiction: {
    name: "Law of Non-Contradiction",
    principle: "Two contradictory statements cannot both be true simultaneously",
    application: "When evaluating conflicting claims, at least one must be false",
    examples: ["'A exists' and 'A does not exist' cannot both be true", "'All X are Y' and 'Some X are not Y' are contradictory"]
  },

  excludedMiddle: {
    name: "Law of Excluded Middle", 
    principle: "For any factual proposition P, either P is true or P is false",
    application: "Avoid false middle grounds on binary factual claims",
    examples: ["Either vaccines cause autism or they don't - no middle position exists", "Historical events either happened or didn't"]
  },
  
  identity: {
    name: "Law of Identity",
    principle: "A thing is what it is (A = A)",
    application: "Consistent definitions and clear terminology prevent equivocation",
    examples: ["If 'safe' means X in premise 1, it must mean X in premise 2", "Terms cannot shift meaning mid-argument"]
  }
};

const REASONING_FRAMEWORKS = {
  evidenceEvaluation: {
    hierarchy: ["Scientific consensus", "Peer-reviewed studies", "Expert testimony", "Empirical data", "Anecdotal evidence", "Unsupported claims"],
    burdenOfProof: "Positive claims require evidence; extraordinary claims require extraordinary evidence",
    nullHypothesis: "Default position is skepticism until evidence is provided"
  },
  
  causalAnalysis: {
    requirements: ["Temporal precedence", "Correlation", "Plausible mechanism", "Alternative explanations ruled out"],
    fallacies: ["Post hoc ergo propter hoc", "Cum hoc ergo propter hoc", "Correlation ≠ causation"]
  },
  
  argumentStructure: {
    validity: "Conclusion follows logically from premises",
    soundness: "Valid argument with true premises",
    strength: "Premises provide good support for conclusion"
  }
};

const FALLACY_DETECTION = {
  formal: [
    "Affirming the consequent",
    "Denying the antecedent", 
    "Equivocation",
    "Composition/Division"
  ],
  
  informal: [
    "Ad hominem",
    "Appeal to authority (inappropriate)",
    "Appeal to popularity", 
    "Appeal to emotion",
    "Straw man",
    "False dichotomy",
    "Slippery slope",
    "Circular reasoning"
  ]
};

// Context-specific principle sets
const CONTEXT_FRAMEWORKS = {
  contradiction: {
    focus: "Logical incompatibility detection",
    principles: [
      FOUNDATIONAL_LOGIC.nonContradiction,
      FOUNDATIONAL_LOGIC.identity
    ],
    guidelines: [
      "Two statements contradict if accepting both creates logical impossibility",
      "Semantic variations of same concept are not contradictions",
      "Temporal context matters - positions can evolve over time",
      "Qualified statements ('usually', 'sometimes') have different truth conditions than absolute claims",
      "Context-dependent claims may both be true in different situations"
    ],
    redFlags: [
      "Do not confuse disagreement with contradiction",
      "Do not flag opinion changes as contradictions", 
      "Do not ignore temporal or contextual qualifiers",
      "Do not assume binary opposites when spectrum exists"
    ]
  },
  
  misinformation: {
    focus: "Critical false information detection",
    principles: [
      REASONING_FRAMEWORKS.evidenceEvaluation,
      FOUNDATIONAL_LOGIC.excludedMiddle
    ],
    guidelines: [
      "Flag only assertions that are definitively false AND potentially harmful",
      "Distinguish between contested theories and debunked claims",
      "Consider intent - is user promoting or merely discussing?",
      "Require strong evidence for misinformation claims",
      "Scientific consensus carries weight but isn't infallible"
    ],
    redFlags: [
      "Do not flag legitimate scientific debate as misinformation",
      "Do not flag historical interpretations unless clearly falsified",
      "Do not flag philosophical or normative positions",
      "Do not flag uncertainty expressions as false claims"
    ]
  },
  
  general: {
    focus: "Balanced reasoning and discourse analysis",
    principles: Object.values(FOUNDATIONAL_LOGIC),
    guidelines: [
      "Prioritize truth over diplomacy",
      "Acknowledge strength of evidence behind positions",
      "Distinguish between fact and interpretation", 
      "Recognize limits of knowledge and certainty",
      "Maintain intellectual humility while being decisive when evidence is clear"
    ],
    redFlags: [
      "Do not false-balance when evidence clearly favors one position",
      "Do not hedge when facts are well-established",
      "Do not treat all opinions as equally valid",
      "Do not avoid judgment when evidence supports a clear conclusion"
    ]
  }
};

/**
 * Get context-aware logical principles for enhanced reasoning
 * @param {string} contextType - Type of reasoning context
 * @returns {string} Formatted logical principles for prompt injection
 */
function getLogicalContext(contextType = 'general') {
  const log = logger.child({ component: 'logic' });
  log.debug("Building reasoning framework", { contextType });
  
  const framework = CONTEXT_FRAMEWORKS[contextType] || CONTEXT_FRAMEWORKS.general;
  
  let output = `LOGICAL REASONING FRAMEWORK - ${framework.focus.toUpperCase()}\n\n`;
  
  // Add relevant foundational principles
  if (framework.principles) {
    output += "FOUNDATIONAL PRINCIPLES:\n";
    framework.principles.forEach(principle => {
      if (typeof principle === 'object' && principle.name) {
        output += `• ${principle.name}: ${principle.principle}\n`;
        if (principle.application) {
          output += `  Application: ${principle.application}\n`;
        }
      }
    });
    output += "\n";
  }
  
  // Add context-specific guidelines
  if (framework.guidelines) {
    output += "REASONING GUIDELINES:\n";
    framework.guidelines.forEach(guideline => {
      output += `• ${guideline}\n`;
    });
    output += "\n";
  }
  
  // Add red flags and warnings
  if (framework.redFlags) {
    output += "CRITICAL WARNINGS:\n";
    framework.redFlags.forEach(redFlag => {
      output += `⚠️ ${redFlag}\n`;
    });
    output += "\n";
  }
  
  // Add evidence hierarchy for relevant contexts
  if (contextType === 'misinformation' || contextType === 'general') {
    output += "EVIDENCE HIERARCHY (strongest to weakest):\n";
    REASONING_FRAMEWORKS.evidenceEvaluation.hierarchy.forEach((level, index) => {
      output += `${index + 1}. ${level}\n`;
    });
    output += "\n";
  }
  
  // Add fallacy awareness for general reasoning
  if (contextType === 'general') {
    output += "COMMON FALLACIES TO AVOID:\n";
    output += `Formal: ${FALLACY_DETECTION.formal.join(', ')}\n`;
    output += `Informal: ${FALLACY_DETECTION.informal.join(', ')}\n\n`;
  }
  
  log.debug("Generated reasoning framework", { 
    lines: output.split('\n').length,
    contextType
  });
  return output.trim();
}

/**
 * Get specific logical principle for targeted application
 * @param {string} principleName - Name of specific principle
 * @returns {Object} Principle details
 */
function getSpecificPrinciple(principleName) {
  return FOUNDATIONAL_LOGIC[principleName] || null;
}

/**
 * Analyze content for logical issues and provide recommendations (cached)
 * @param {string} content - Content to analyze
 * @param {Map} cache - Optional cache for performance
 * @returns {Object} Analysis results and recommendations
 */
function analyzeLogicalContent(content, cache = null) {
  // Check cache first if provided
  if (cache) {
    const cacheKey = content.trim().toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 60000)) { // 1 minute TTL
      return cached.analysis;
    }
  }
  
  const analysis = {
    hasUncertainty: false,
    hasTemporal: false,
    hasAbsolutes: false,
    hasEvidence: false,
    substantiveness: 0, // 0-1 score of how substantive the content is
    recommendations: []
  };
  
  const lowerContent = content.toLowerCase();
  
  // Check for uncertainty markers
  const uncertaintyMarkers = ['maybe', 'perhaps', 'possibly', 'might', 'could', 'i think', 'i believe', 'seems like', 'appears'];
  analysis.hasUncertainty = uncertaintyMarkers.some(marker => lowerContent.includes(marker));
  
  // Check for temporal markers
  const temporalMarkers = ['used to', 'previously', 'before', 'now', 'currently', 'today', 'at first', 'initially', 'later', 'then'];
  analysis.hasTemporal = temporalMarkers.some(marker => lowerContent.includes(marker));
  
  // Check for absolute claims
  const absoluteMarkers = ['all', 'every', 'none', 'never', 'always', 'definitely', 'certainly'];
  analysis.hasAbsolutes = absoluteMarkers.some(marker => lowerContent.includes(marker));
  
  // Check for evidence indicators
  const evidenceMarkers = ['study', 'research', 'data', 'proven', 'evidence', 'source', 'according to'];
  analysis.hasEvidence = evidenceMarkers.some(marker => lowerContent.includes(marker));
  
  // Calculate substantiveness score (0-1)
  let substantiveness = 0.5; // Base score
  
  // High-impact topics that always need analysis (medical, scientific, political)
  const highImpactTopics = [
    'vaccine', 'medicine', 'drug', 'treatment', 'cure', 'disease', 'health', 'covid', 'cancer',
    'climate', 'global warming', 'earth', 'evolution', 'science', 'study', 'research',
    'election', 'vote', 'government', 'conspiracy', 'holocaust', 'assassination'
  ];
  
  const hasHighImpactTopic = highImpactTopics.some(topic => lowerContent.includes(topic));
  if (hasHighImpactTopic) {
    substantiveness += 0.4; // Significant boost for important topics
  }
  
  // Definitive claims (including negative claims)
  const definitiveMarkers = [
    'don\'t work', 'doesn\'t work', 'do not work', 'does not work',
    'cause', 'causes', 'prevent', 'prevents', 'cure', 'cures',
    'are dangerous', 'is dangerous', 'are safe', 'is safe',
    'never', 'always', 'all', 'none', 'every', 'no'
  ];
  
  const hasDefinitiveClaim = definitiveMarkers.some(marker => lowerContent.includes(marker));
  if (hasDefinitiveClaim) {
    substantiveness += 0.3;
  }
  
  // Standard factors that increase substantiveness
  if (analysis.hasEvidence) substantiveness += 0.2;
  if (analysis.hasAbsolutes) substantiveness += 0.1;
  if (content.length > 50) substantiveness += 0.1;
  if (content.includes('because') || content.includes('therefore') || content.includes('thus')) substantiveness += 0.1;
  
  // Factors that decrease substantiveness (but don't penalize high-impact topics as much)
  if (analysis.hasUncertainty) substantiveness -= 0.1;
  if (content.length < 20 && !hasHighImpactTopic) substantiveness -= 0.1; // Reduced penalty for short high-impact claims
  
  analysis.substantiveness = Math.max(0, Math.min(1, substantiveness));
  
  // Generate recommendations
  if (analysis.hasUncertainty) {
    analysis.recommendations.push("Consider uncertainty markers when evaluating definitiveness");
  }
  if (analysis.hasTemporal) {
    analysis.recommendations.push("Account for temporal context in contradiction detection");
  }
  if (analysis.hasAbsolutes && !analysis.hasEvidence) {
    analysis.recommendations.push("Absolute claims require strong evidence");
  }
  if (analysis.substantiveness < 0.3) {
    analysis.recommendations.push("Low substantiveness - may not warrant detailed analysis");
  }
  
  // Cache the result if cache provided
  if (cache) {
    const cacheKey = content.trim().toLowerCase();
    cache.set(cacheKey, { analysis, timestamp: Date.now() });
  }
  
  return analysis;
}

module.exports = {
  getLogicalContext,
  getSpecificPrinciple,
  analyzeLogicalContent,
  FOUNDATIONAL_LOGIC,
  REASONING_FRAMEWORKS,
  FALLACY_DETECTION
};

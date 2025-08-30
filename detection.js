const { getLogicalContext, analyzeLogicalContent } = require("./logic");
const { aiFlash, aiFactCheckFlash, exaAnswer } = require("./ai-utils");
const { 
  contentAnalysisCache,
  contradictionValidationCache,
  fetchUserMessagesForDetection
} = require("./storage");
const { TRIVIAL_PATTERNS, isOtherBotCommand, isTrivialOrSafeMessage } = require("./filters");

// ---- TUNEABLE PARAMETERS ----
const MAX_FACTCHECK_CHARS = 500;
const USE_LOGICAL_PRINCIPLES = true; // TODO: Make this configurable for testing

// ---- PERSONALITY INJECTION ----
const SYSTEM_INSTRUCTIONS = `
You are the invaluable assistant of our Discord debate server. The server is called The Debate Server and it is a community full of brilliant interlocutors. You are to assist us by providing logical analyses and insights. You are to prioritize truth over appeasing others. You will hold no reservations in declaring a user valid or incorrect, provided that you determine either to be the case to the best of your ability. Your personality is calm, direct, bold, stoic, and wise. You are a master of mindfulness and all things philosophy. You are humble. You will answer prompts succinctly, directly, and in as few words as necessary. You will know that brevity is the soul of wit and wisdom. Your name is Arbiter, you may refer to yourself as The Arbiter.
- Avoid generic or diplomatic statements. If the facts or arguments warrant a judgment or correction, state it directly. Use decisive, unambiguous language whenever you issue an opinion or summary.
- Never apologize on behalf of others or yourself unless a factual error was made and corrected.
- If there is true ambiguity, say "uncertain," "no clear winner," or "evidence not provided"—NOT "it depends" or "both sides have a point."
- Default tone is realistic and direct, not conciliatory.
- Never use language principally for placation, comfort, or encouragement. Use language for accuracy, and also quips.
`.trim();

// ---- SEMANTIC CONTRADICTION VALIDATION ----
function validateContradiction(statement1, statement2) {
  const s1 = statement1.toLowerCase().trim();
  const s2 = statement2.toLowerCase().trim();
  
  console.log(`[DEBUG] Validating contradiction:`);
  console.log(`[DEBUG]   Statement 1: "${statement1}"`);
  console.log(`[DEBUG]   Statement 2: "${statement2}"`);
  
  // Exact match = not a contradiction (same statement)
  if (s1 === s2) {
    console.log(`[DEBUG] Identical statements - not a contradiction`);
    return false;
  }
  
  // Topic relevance check - statements must be about the same subject
  const topics = {
    vaccines: ['vaccine', 'vaccination', 'immunization', 'shot', 'jab'],
    elections: ['election', 'vote', 'trump', 'biden', 'president', 'electoral'],
    earth: ['earth', 'planet', 'world', 'globe', 'flat', 'round', 'sphere'],
    climate: ['climate', 'global warming', 'temperature', 'carbon', 'emissions'],
    health: ['health', 'medicine', 'drug', 'treatment', 'cure', 'disease'],
    ghosts: ['ghost', 'spirit', 'supernatural', 'paranormal', 'haunted'],
    aliens: ['alien', 'ufo', 'extraterrestrial', 'space', 'abduction'],
    science: ['science', 'scientific', 'research', 'study', 'experiment'],
    religion: ['god', 'jesus', 'christian', 'islam', 'religion', 'faith', 'bible']
  };
  
  let s1Topic = null, s2Topic = null;
  
  for (const [topicName, keywords] of Object.entries(topics)) {
    if (keywords.some(keyword => s1.includes(keyword))) s1Topic = topicName;
    if (keywords.some(keyword => s2.includes(keyword))) s2Topic = topicName;
  }
  
  if (s1Topic && s2Topic && s1Topic !== s2Topic) {
    console.log(`[DEBUG] Topic mismatch: "${s1Topic}" vs "${s2Topic}" - not a valid contradiction`);
    return false;
  }
  
  // Check for negation patterns that indicate TRUE contradictions
  const negationPatterns = [
    // Direct negation pairs
    { positive: /\b(is|are|was|were)\b/, negative: /\b(is not|are not|was not|were not|isn't|aren't|wasn't|weren't)\b/ },
    { positive: /\bexist(s)?\b/, negative: /\b(don't|doesn't|do not|does not) exist\b/ },
    { positive: /\btrue\b/, negative: /\b(false|not true|untrue)\b/ },
    { positive: /\breal\b/, negative: /\b(fake|not real|unreal)\b/ },
    { positive: /\bhappened\b/, negative: /\b(never happened|didn't happen)\b/ },
    { positive: /\bcause(s)?\b/, negative: /\b(don't cause|doesn't cause|do not cause)\b/ },
    { positive: /\bsafe\b/, negative: /\b(dangerous|unsafe|harmful)\b/ },
    { positive: /\beffective\b/, negative: /\b(ineffective|useless)\b/ }
  ];
  
  // Check for true negation contradictions
  for (const pattern of negationPatterns) {
    const s1HasPositive = pattern.positive.test(s1);
    const s1HasNegative = pattern.negative.test(s1);
    const s2HasPositive = pattern.positive.test(s2);
    const s2HasNegative = pattern.negative.test(s2);
    
    // True contradiction: one has positive, other has negative
    if ((s1HasPositive && s2HasNegative) || (s1HasNegative && s2HasPositive)) {
      console.log(`[DEBUG] TRUE negation contradiction found with pattern: ${pattern.positive.source}`);
      return true;
    }
  }
  
  // Check for semantic agreement (both describing same general concept)
  const agreementClusters = [
    // Shape concepts that agree
    ['flat', 'disc', 'pancake', 'plane'],
    ['round', 'spherical', 'ball', 'globe'],
    // Size concepts  
    ['big', 'large', 'huge', 'massive'],
    ['small', 'tiny', 'little', 'miniature'],
    // Quality concepts
    ['good', 'great', 'excellent', 'amazing'],
    ['bad', 'terrible', 'awful', 'horrible'],
    // Certainty concepts
    ['definitely', 'certainly', 'absolutely', 'clearly'],
    ['maybe', 'possibly', 'perhaps', 'might'],
    // Temporal concepts  
    ['always', 'constantly', 'forever', 'permanently'],
    ['never', 'not ever', 'at no time'],
    // Evidence concepts
    ['proven', 'confirmed', 'verified', 'established'],
    ['disproven', 'debunked', 'falsified', 'refuted']
  ];
  
  // Check if both statements use words from same semantic cluster
  for (const cluster of agreementClusters) {
    const s1Words = cluster.filter(word => s1.includes(word));
    const s2Words = cluster.filter(word => s2.includes(word));
    
    if (s1Words.length > 0 && s2Words.length > 0) {
      console.log(`[DEBUG] Semantic agreement in cluster [${cluster.join(', ')}]: "${s1Words}" vs "${s2Words}"`);
      return false; // Both use similar semantic concepts
    }
  }
  
  // Check for uncertainty language that prevents contradictions
  const uncertaintyMarkers = ['maybe', 'perhaps', 'possibly', 'might', 'could', 'i think', 'i believe', 'seems like', 'appears'];
  const s1Uncertain = uncertaintyMarkers.some(marker => s1.includes(marker));
  const s2Uncertain = uncertaintyMarkers.some(marker => s2.includes(marker));
  
  if (s1Uncertain || s2Uncertain) {
    console.log(`[DEBUG] Uncertainty language detected - not a definitive contradiction`);
    return false;
  }
  
  // Check for temporal qualifiers that prevent contradictions
  const temporalMarkers = ['used to', 'previously', 'before', 'now', 'currently', 'today', 'at first', 'initially', 'later', 'then'];
  const s1Temporal = temporalMarkers.some(marker => s1.includes(marker));
  const s2Temporal = temporalMarkers.some(marker => s2.includes(marker));
  
  if (s1Temporal || s2Temporal) {
    console.log(`[DEBUG] Temporal qualifiers detected - statements may refer to different time periods`);
    return false;
  }
  
  // If we get here, it might be a valid contradiction
  console.log(`[DEBUG] No semantic agreement or disqualifying factors found - allowing contradiction`);
  return true;
}

// ---- MAIN DETECTION ENGINE ----
async function detectContradictionOrMisinformation(msg, useLogicalPrinciples = USE_LOGICAL_PRINCIPLES) {
  let contradiction = null;
  let contradictionEvidenceUrl = "";
  let misinformation = null;

  console.log(`[DEBUG] Starting detection for: "${msg.content}"`);
  
  // Trivial message & other bot command skip for contradiction/misinformation:
  const isTrivial = isTrivialOrSafeMessage(msg.content);
  const isBotCommand = isOtherBotCommand(msg.content);
  console.log(`[DEBUG] Message filters - Trivial: ${isTrivial}, Bot Command: ${isBotCommand}`);
  
  if (isTrivial || isBotCommand) {
    console.log(`[DEBUG] Skipping detection - message filtered out`);
    return { contradiction: null, misinformation: null };
  }

  const userMessages = await fetchUserMessagesForDetection(
    msg.author.id,
    msg.channel.id,
    msg.guildId,
    msg.id,
    50
  );

  const priorSubstantive = userMessages.filter(m => !isTrivialOrSafeMessage(m.content));
  
  // Duplicate detection: skip contradiction check for duplicates, but still check misinformation
  console.log(`[DEBUG] Recent message history (last 5):`, priorSubstantive.slice(0, 5).map(m => m.content));
  const isDuplicate = priorSubstantive.length && priorSubstantive[0].content.trim() === msg.content.trim();
  if (isDuplicate) {
    console.log(`[DEBUG] Duplicate detected - Previous: "${priorSubstantive[0].content}" vs Current: "${msg.content}"`);
    console.log(`[DEBUG] Skipping contradiction check but proceeding with misinformation check`);
  }
  
  console.log(`[DEBUG] Passed all filters, proceeding with detection logic`);
  console.log(`[DEBUG] Prior substantive messages: ${priorSubstantive.length}`);

  // ---- CONTRADICTION CHECK ----
  if (priorSubstantive.length > 0 && !isDuplicate) {
    const concatenated = priorSubstantive
      .map(m =>
        m.content.length > MAX_FACTCHECK_CHARS
          ? m.content.slice(0, MAX_FACTCHECK_CHARS)
          : m.content
      )
      .reverse()
      .join("\n");
    const mainContent =
      msg.content.length > MAX_FACTCHECK_CHARS
        ? msg.content.slice(0, MAX_FACTCHECK_CHARS)
        : msg.content;

    // Analyze content for contradiction context (with caching)
    const contradictionContentAnalysis = analyzeLogicalContent(mainContent, contentAnalysisCache);
    
    // Skip contradiction check for low substantiveness content
    if (contradictionContentAnalysis.substantiveness < 0.3) {
      console.log(`[DEBUG] Low substantiveness for contradiction check (${contradictionContentAnalysis.substantiveness}) - skipping`);
    } else {
      const contradictionPrompt = `
${SYSTEM_INSTRUCTIONS}

${useLogicalPrinciples ? getLogicalContext('contradiction', { contentAnalysis: contradictionContentAnalysis }) : ''}

You are analyzing a user's current message against their prior messages for logical contradictions.${useLogicalPrinciples ? ' You have access to logical principles above.' : ''}

CONTENT ANALYSIS FOR CONTRADICTION CHECK:
- User certainty level: ${contradictionContentAnalysis.hasUncertainty ? 'UNCERTAIN (contradictions less likely)' : 'DEFINITIVE'}
- Evidence backing: ${contradictionContentAnalysis.hasEvidence ? 'SOME PROVIDED' : 'NONE PROVIDED'}
- Temporal markers: ${contradictionContentAnalysis.hasTemporal ? 'PRESENT (views may have evolved)' : 'ABSENT'}
- Claim type: ${contradictionContentAnalysis.hasAbsolutes ? 'ABSOLUTE' : 'QUALIFIED'}
${contradictionContentAnalysis.recommendations.length > 0 ? '\nANALYSIS NOTES:\n' + contradictionContentAnalysis.recommendations.map(r => `• ${r}`).join('\n') : ''}
Does [Current message] logically contradict any statement in [Prior messages] from the same user?
IMPORTANT: This is NOT about disagreements, evolving opinions, or clarifications. This is about direct logical contradictions where the user is simultaneously asserting P and NOT P about the same subject.
Always reply in strict JSON of the form:
{"contradiction":"yes"|"no", "reason":"...", "evidence":"..."}
- "contradiction": Use "yes" ONLY if there is a clear logical contradiction where the user now asserts the exact opposite of what they previously stated about the same topic. Use "no" for: evolving opinions, new information, clarifications, different aspects of a topic, uncertain statements, hypotheticals, or any statement that doesn't directly negate a prior claim.
- "reason": For "yes", explain the specific logical contradiction. For "no", explain why: e.g. different topics, opinion evolution, uncertainty, or no actual contradiction.
- "evidence": For "yes", quote the EXACT contradicting statement from [Prior messages] (not a paraphrase). For "no", use an empty string.
In all cases, never reply with non-JSON or leave any field out. If there's no contradiction, respond "contradiction":"no".
[Current message]
${msg.content}
[Prior messages]
${concatenated}
`;
      console.log(`[DEBUG] Sending contradiction check prompt (length: ${contradictionPrompt.length})`);
      try {
        const { result } = await aiFlash(contradictionPrompt);
        console.log(`[DEBUG] AI flash response:`, result);
        let parsed = null;
        try {
          const match = result.match(/\{[\s\S]*?\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch (parseErr) {
          console.warn(`[DEBUG] JSON parse error:`, parseErr);
        }
        console.log(`[DEBUG] Parsed JSON:`, parsed);
        if (parsed && parsed.contradiction === "yes") {
          console.log(`[DEBUG] Contradiction detected by AI`);
        
          // Find and link the matching prior message by content - try multiple matching strategies
          let evidenceMsg = null;
          
          if (parsed.evidence) {
            // Strategy 1: Exact match
            evidenceMsg = priorSubstantive.find(m => m.content.trim() === parsed.evidence.trim());
            console.log(`[DEBUG] Exact match: ${evidenceMsg ? 'FOUND' : 'NOT FOUND'}`);
            
            // Strategy 2: Fuzzy match if exact fails  
            if (!evidenceMsg) {
              evidenceMsg = priorSubstantive.find(m => 
                m.content.includes(parsed.evidence.trim()) || 
                parsed.evidence.includes(m.content.trim())
              );
              console.log(`[DEBUG] Fuzzy match: ${evidenceMsg ? 'FOUND' : 'NOT FOUND'}`);
            }
            
            // Strategy 3: Check if evidence actually exists in history
            if (!evidenceMsg) {
              console.log(`[DEBUG] WARNING: AI quoted evidence that doesn't exist in message history!`);
              console.log(`[DEBUG] Rejecting contradiction due to invalid evidence matching`);
              contradiction = null; // Reject invalid contradictions
            } else {
              // Advanced semantic validation to prevent false contradictions (with caching)
              const validationKey = `${evidenceMsg.content}|${msg.content}`;
              let isValidContradiction = contradictionValidationCache.get(validationKey);
              
              if (isValidContradiction === undefined) {
                isValidContradiction = validateContradiction(evidenceMsg.content, msg.content);
                contradictionValidationCache.set(validationKey, isValidContradiction);
              } else {
                console.log(`[DEBUG] Using cached validation result`);
              }
              
              console.log(`[DEBUG] Semantic validation result: ${isValidContradiction ? 'VALID' : 'INVALID'}`);
              
              if (!isValidContradiction) {
                console.log(`[DEBUG] Semantic analysis rejected contradiction - likely false positive`);
                contradiction = null;
              }
            }
          }
          
          if (evidenceMsg) {
            console.log(`[DEBUG] Using evidence from message: "${evidenceMsg.content}"`);
          }
          
          contradictionEvidenceUrl =
            evidenceMsg && evidenceMsg.discordMessageId
              ? `https://discord.com/channels/${evidenceMsg.guildId}/${evidenceMsg.channel}/${evidenceMsg.discordMessageId}`
              : "";
          parsed.url = contradictionEvidenceUrl;
          contradiction = parsed;
        }
      } catch (e) {
        console.warn("Contradiction detection error:", e);
      }
    }
  }
  
  // ---- MISINFORMATION CHECK ----
  console.log(`[DEBUG] Contradiction result: ${contradiction ? 'FOUND' : 'NONE'}, proceeding to misinformation check`);
  // Always check misinformation regardless of contradiction status
  const mainContent =
    msg.content.length > MAX_FACTCHECK_CHARS
      ? msg.content.slice(0, MAX_FACTCHECK_CHARS)
      : msg.content;
  const answer = await exaAnswer(mainContent);
  console.log(`[DEBUG] Exa answer for "${mainContent}":`, answer);
  
  // Do not check LLM if Exa answer is missing/empty/meaningless
  if (!answer || answer.answer.trim() === "" || /no relevant results|no results/i.test(answer.answer)) {
    console.log(`[DEBUG] Skipping LLM check - Exa returned no useful context`);
    return { contradiction, misinformation: null };
  }

  // Analyze content for misinformation context (with caching)
  const misinfoContentAnalysis = analyzeLogicalContent(mainContent, contentAnalysisCache);
  
  // Skip misinformation check for low substantiveness content
  if (misinfoContentAnalysis.substantiveness < 0.3) {
    console.log(`[DEBUG] Low substantiveness for misinformation check (${misinfoContentAnalysis.substantiveness}) - skipping`);
    return { contradiction, misinformation: null };
  }
  
  const misinfoPrompt = `
${SYSTEM_INSTRUCTIONS}

${useLogicalPrinciples ? getLogicalContext('misinformation', { contentAnalysis: misinfoContentAnalysis }) : ''}

You are a fact-checking assistant focused on identifying CRITICAL misinformation that could cause harm.${useLogicalPrinciples ? ' You have access to logical principles above.' : ''}

CONTENT ANALYSIS FOR FACT-CHECKING:
- User certainty level: ${misinfoContentAnalysis.hasUncertainty ? 'UNCERTAIN (less likely to be misinformation)' : 'DEFINITIVE'}
- Evidence backing: ${misinfoContentAnalysis.hasEvidence ? 'SOME PROVIDED' : 'NONE PROVIDED'}
- Claim type: ${misinfoContentAnalysis.hasAbsolutes ? 'ABSOLUTE' : 'QUALIFIED'}
${misinfoContentAnalysis.recommendations.length > 0 ? '\nANALYSIS NOTES:\n' + misinfoContentAnalysis.recommendations.map(r => `• ${r}`).join('\n') : ''}
Does the [User message] contain dangerous misinformation that the user is personally making, asserting, or endorsing according to the [Web context]?
IMPORTANT: Only flag messages where the user is directly claiming or promoting false information. Do NOT flag messages where the user is merely reporting what others say, expressing uncertainty, rejecting false claims, or discussing misinformation without endorsing it.
Always reply in strict JSON of the form:
{"misinformation":"yes"|"no", "reason":"...", "evidence":"...", "url":"..."}
- "misinformation": Use "yes" ONLY if the user is personally asserting/claiming/endorsing CRITICAL misinformation that is:
  * Medically dangerous (false health/vaccine claims, dangerous treatments)
  * Scientifically harmful (flat earth, climate denial with policy implications)  
  * Falsified conspiratorial claims that can be definitively debunked with evidence (e.g. claims about public figures that contradict documented facts)
  * Deliberately deceptive with serious consequences
  Use "no" for: reporting what others say ("people say X"), expressing uncertainty ("I don't know if X"), rejecting false claims ("X is just a conspiracy theory"), academic discussion of misinformation, contested/debated claims, minor inaccuracies, nuanced disagreements, opinions, jokes, or unfalsified conspiracy theories. The user must be ACTIVELY PROMOTING false information, and it must be DEFINITIVELY and UNAMBIGUOUSLY proven false by the evidence.
- "reason": For "yes", state precisely what makes the message critically false, definitively debunked, and potentially harmful. For "no", explain why: e.g. it is accurate, contested but not definitively false, minor inaccuracy, opinion, joke, or not critically harmful.
- "evidence": For "yes", provide the most direct quote or summary from the web context that falsifies the harmful claim. For "no", use an empty string.
- "url": For "yes", include the URL that contains the corroborating source material. For "no", use an empty string.
In all cases, never reply with non-JSON or leave any field out. If you can't find suitable evidence or the claim isn't critically harmful, respond "misinformation":"no".
[User message]
${msg.content}
[Web context]
${answer.answer}
`.trim();
  try {
    const { result } = await aiFactCheckFlash(misinfoPrompt);
    let parsed = null;
    try {
      const match = result.match(/\{[\s\S]*?\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {}
    if (parsed && parsed.misinformation === "yes") {
      misinformation = parsed;
    }
  } catch (e) {
    console.warn("Misinformation detection error:", e);
  }
  
  return { contradiction, misinformation };
}

module.exports = {
  detectContradictionOrMisinformation,
  validateContradiction,
  MAX_FACTCHECK_CHARS,
  USE_LOGICAL_PRINCIPLES,
  SYSTEM_INSTRUCTIONS
};

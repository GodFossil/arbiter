/**
 * Core logical principles and reasoning frameworks for Arbiter
 * These principles are injected into reasoning prompts to enhance logical analysis
 */

const LOGICAL_PRINCIPLES = `
CORE LOGICAL PRINCIPLES FOR REASONING:

1. LAW OF NON-CONTRADICTION: Two contradictory statements cannot both be true simultaneously. If A is true, then not-A must be false.

2. LAW OF EXCLUDED MIDDLE: For any proposition P, either P is true or P is false. No middle ground exists for factual claims.

3. BURDEN OF PROOF: The person making a positive claim bears the responsibility to provide evidence. Absence of evidence is not evidence of absence, but extraordinary claims require extraordinary evidence.

4. FALSE DICHOTOMY: Avoid assuming only two options exist when multiple possibilities may be valid. However, some claims genuinely are binary (true/false).

5. LOGICAL CONSISTENCY: Arguments must be internally consistent. If someone holds contradictory positions, at least one must be incorrect.

6. EVIDENCE HIERARCHY: Scientific consensus > peer-reviewed studies > expert opinion > anecdotal evidence > unsupported claims.

7. CAUSAL vs CORRELATIONAL: Correlation does not imply causation. Temporal sequence and plausible mechanisms are required for causal claims.

8. DEFINITIONAL CLARITY: Terms must be clearly defined. Equivocation (using the same word with different meanings) leads to invalid arguments.

9. APPEAL TO AUTHORITY: Expert testimony is valuable in their field of expertise, but expertise doesn't transfer between unrelated domains.

10. FACTUAL vs NORMATIVE: Distinguish between descriptive claims (what is) and prescriptive claims (what ought to be). Facts can be verified; values are debated.
`.trim();

const CONTRADICTION_PRINCIPLES = `
CONTRADICTION DETECTION PRINCIPLES:

TRUE CONTRADICTIONS (flag these):
- Direct negation: "A is true" vs "A is false"
- Mutually exclusive states: "X is alive" vs "X is dead"
- Binary opposites: "It happened" vs "It never happened"  
- Absolute vs negative: "All X are Y" vs "No X are Y"
- Existence claims: "X exists" vs "X does not exist"

NOT CONTRADICTIONS (do not flag):
- Opinion differences: "I like X" vs "I dislike X" (both can be true at different times)
- Nuanced positions: "X is mostly good" vs "X has problems" (both can be true)
- Degree differences: "X is very important" vs "X is somewhat important"
- Context-dependent: "X works in situation A" vs "X doesn't work in situation B"
- Temporal evolution: "I used to think X" vs "Now I think Y"
- Qualified statements: "X is usually true" vs "X was false in this case"
- Different aspects: "X is technically correct" vs "X is misleading"

EXACT EVIDENCE REQUIREMENT:
- Quote the contradictory statement EXACTLY as written
- Do not paraphrase or summarize
- If you cannot find the exact contradictory statement, respond "contradiction":"no"
`.trim();

const MISINFORMATION_PRINCIPLES = `
MISINFORMATION DETECTION PRINCIPLES:

Critical misinformation (flag):
- Medically dangerous false claims
- Scientifically disproven assertions with policy implications
- Definitively falsified conspiracy theories with evidence
- Deliberate deception with serious consequences

NOT misinformation (do not flag):
- Contested but plausible theories
- Minor factual errors without harm
- Opinions and value judgments
- Uncertainty expressions ("I think", "maybe")
- Reporting others' claims ("people say")
- Academic discussion of false ideas
`.trim();

function getLogicalContext(contextType = 'general') {
  console.log(`[LOGIC] Injecting logical principles - context: ${contextType}`);
  
  const contexts = {
    general: LOGICAL_PRINCIPLES,
    contradiction: `${LOGICAL_PRINCIPLES}\n\n${CONTRADICTION_PRINCIPLES}`,
    misinformation: `${LOGICAL_PRINCIPLES}\n\n${MISINFORMATION_PRINCIPLES}`,
    comprehensive: `${LOGICAL_PRINCIPLES}\n\n${CONTRADICTION_PRINCIPLES}\n\n${MISINFORMATION_PRINCIPLES}`
  };
  
  return contexts[contextType] || contexts.general;
}

module.exports = {
  getLogicalContext,
  LOGICAL_PRINCIPLES,
  CONTRADICTION_PRINCIPLES,
  MISINFORMATION_PRINCIPLES
};

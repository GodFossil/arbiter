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

- Direct logical contradictions: "A" vs "not A"
- Mutually exclusive categories: "X is Y" vs "X is Z" (when Y and Z cannot coexist)
- Temporal contradictions: Claims about timing that cannot both be true
- Quantitative contradictions: Numerical claims that conflict
- Definitional contradictions: Using the same term with incompatible meanings

AVOID flagging as contradictions:
- Different aspects of complex topics
- Temporal changes in position (specify timeframe)
- Degrees of certainty vs absolute claims
- Context-dependent statements
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

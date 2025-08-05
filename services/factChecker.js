import extractClaims from './claimExtractor.js';
import performWebSearch from './webSearch.js';
import scoreConfidence from './confidenceScorer.js';
import { generate, MODELS } from './geminiClient.js';
export default async function factCheck(rawText) {
 const claims = await extractClaims(rawText);
 if (!claims.length) return [];
 return Promise.all(
 claims.map(async claim => {
 const snippets = await performWebSearch(claim, 5);
 const evidence = snippets.map(s => s.snippet).join('\n');
 const score = await scoreConfidence(claim, evidence);  const rationale = await generate({ model: MODELS.BACKGROUND, messages: [ { role: 'user', content: `Explain in ≤100 words why the confidence is about ${score} for the claim:\n${claim}\n\nEVIDENCE:\n${evidence}` } ], maxTokens: 128 });  return { claim, evidence: snippets, score, rationale }; })
 );
}
import { generate, MODELS } from './geminiClient.js';
export default async function scoreConfidence(claim, evidence) {
 const prompt = `
Rate from 0-100 how confidently the EVIDENCE supports the CLAIM.
Respond ONLY with the integer.
CLAIM:
${claim}
EVIDENCE:
${evidence}
`;
 const txt = await generate({
 model: MODELS.BACKGROUND,
 messages: [{ role: 'user', content: prompt }],
 maxTokens: 10,
 temperature: 0
 });
 const n = parseInt(txt.match(/\d+/)?.[0] ?? '0', 10);
 return Math.max(0, Math.min(100, n));
}
import { generate, MODELS } from './geminiClient.js';
export default async function extractClaims(rawText = '') {
 if (!rawText.trim()) return [];
 const prompt = `
You are a claim extraction micro-service.
Return a JSON array where each element is a short factual claim
(≤200 chars) found in the supplied text.
Do NOT add any extra keys.
TEXT:
"""${rawText.slice(0, 6_000)}"""
`;
 const answer = await generate({
 model: MODELS.BACKGROUND,
 messages: [{ role: 'user', content: prompt }],
 maxTokens: 256,
 temperature: 0
 });
 try {
 const claims = JSON.parse(answer);
 return Array.isArray(claims) ? claims : [];
 } catch {
 return [];
 }
}
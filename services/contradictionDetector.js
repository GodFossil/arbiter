import { generate, MODELS } from './geminiClient.js';
export default async function detectContradiction(summaryA, summaryB) {
 const prompt = `
Do the following two summaries contradict each other?
Respond with "yes" or "no" ONLY.
A:
${summaryA}
B:
${summaryB}
`;
 const response = await generate({
 model: MODELS.BACKGROUND,
 messages: [{ role: 'user', content: prompt }],
 maxTokens: 5,
 temperature: 0
 });
 return /^y(es)?/i.test(response.trim());
}
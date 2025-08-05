import { generate, MODELS } from './geminiClient.js';
export default async function analyzeThread(messages) {
 const limited = messages.slice(-15); // last 15 msgs only
 const prompt = `
Summarise the following Discord thread in ≤120 words.
Highlight any outstanding questions asked by the user.
{limited.map(m => `[{m.author}]: ${m.content}).join('\n')} ;
 const summary = await generate({
 model: MODELS.BACKGROUND,
 messages: [{ role: 'user', content: prompt }],
 maxTokens: 180
 });
 return summary.trim();
}
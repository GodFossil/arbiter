import { generate, MODELS } from './geminiClient.js';
export async function createVerificationFollowUp(userMessage, lastBotReply) {
 const prompt = `
You are assisting a Discord fact-checker conversation.
Generate ONE clarifying question (≤30 words) you need to ask the user
in order to verify your previous answer if necessary.
Return "none" if no further information is required.
User’s message:
${userMessage}
Your last reply:
${lastBotReply}
`;
 const q = await generate({
 model: MODELS.BACKGROUND,
 messages: [{ role: 'user', content: prompt }],
 maxTokens: 40,
 temperature: 0.3
 });
 return q.trim();
}
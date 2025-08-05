import axios from 'axios';
import logger from './logger.js';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta ';
export const MODELS = Object.freeze({
 BACKGROUND: 'gemini-2.5-flash-lite',
 PRIMARY: 'gemini-2.5-pro',
 FALLBACK: 'gemini-2.5-flash'
});
function mapMessages(messages = []) {
 return messages.map(m => ({
 role: m.role === 'assistant' ? 'model' : 'user',
 parts: [{ text: m.content }]
 }));
}
export async function generate({
 messages,
 model = MODELS.PRIMARY,
 maxTokens = 1024,
 temperature= 0.7
} = {}) {
 if (!process.env.GEMINI_API_KEY) {
 throw new Error('GEMINI_API_KEY env var not set');
 }
 const url = ${GEMINI_BASE}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY};
 const body = {
 contents: mapMessages(messages),
 generationConfig: { maxOutputTokens: maxTokens, temperature }
 };
 try {
 const { data } = await axios.post(url, body, { timeout: 30_000 });
 const text =
 data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
 if (!text) throw new Error('Empty Gemini response');
 return text;
 } catch (err) {
 logger.error(Gemini call failed (${model}): ${err.message});
 if (model === MODELS.PRIMARY)
 return generate({ messages, model: MODELS.FALLBACK, maxTokens, temperature });
 throw err;
 }
}
import PQueue from 'p-queue';
import { generate, MODELS } from './geminiClient.js';
const queue = new PQueue({ concurrency: 3 });
export default function processInParallel(promptArray = []) {
 return Promise.all(
 promptArray.map(p =>
 queue.add(() =>
 generate({
 model: MODELS.BACKGROUND,
 messages: [{ role: 'user', content: p }],
 maxTokens: 60,
 temperature: 0
 })
 )
 )
 );
}
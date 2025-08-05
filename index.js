import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { generate, MODELS } from './geminiClient.js';
import analyzeThread from './threadContextAnalyzer.js';
import factCheck from './factChecker.js';
import logger from './logger.js';
const client = new Client({
 intents: [
 GatewayIntentBits.Guilds,
 GatewayIntentBits.GuildMessages,
 GatewayIntentBits.MessageContent
 ],
 partials: [Partials.Channel]
});
client.on('ready', () =>
 logger.info(🤖 Logged in as ${client.user.tag})
);
client.on('messageCreate', async msg => {
 if (msg.author.bot || !msg.content.startsWith('!ask')) return;
 const userPrompt = msg.content.replace(/^!ask\s*/i, '');
 /* background summarisation first (cheap model) */
 const threadSummary = await analyzeThread(
 await msg.channel.messages.fetch({ limit: 50 })
 .then(col => [...col.values()].reverse())
 );
 /* main user-facing reply using pro → fallback handled in geminiClient */
 const finalReply = await generate({
 messages: [
 { role: 'user', content: threadSummary },
 { role: 'user', content: Answer the user’s latest question: ${userPrompt} }
 ]
 });
 msg.reply(finalReply);
 /* optional async fact-check (fire & forget) */
 factCheck(finalReply)
 .then(res => logger.debug('[Fact-check]', res))
 .catch(err => logger.error('Fact-check failed', err));
});
client.login(process.env.DISCORD_BOT_TOKEN);
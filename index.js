require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const logger = require('./logger');
const { handleError } = require('./errorHandler');
const { factCheckMessage } = require('./factChecker');
const { buildFactCheckReply } = require('./FactCheck');
const { connect } = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, () => {
  logger.info(`Bot logged in as ${client.user.tag}`);
  connect(); // optional Mongo
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  try {
    const results = await factCheckMessage(message.content);
    if (!results || !results.length) return;

    for (const r of results) {
      const reply = await buildFactCheckReply(r.claim, r.verdict, r.sources, r.confidence);
      await message.reply(reply.slice(0, 2000));
    }
  } catch (err) {
    handleError(err, message);
  }
});

client.login(process.env.DISCORD_TOKEN);
// bot.js
require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { connect } = require("./mongo");
const { geminiUserFacing, geminiBackground } = require("./gemini");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Optional: channel whitelist
const CHANNEL_ID_WHITELIST = process.env.CHANNEL_ID_WHITELIST
  ? process.env.CHANNEL_ID_WHITELIST.split(',').map(s => s.trim()).filter(Boolean)
  : null;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== 0) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // Save in Mongo
  try {
    const db = await connect();
    const memory = db.collection("messages");
    await memory.insertOne({
      user: msg.author.id,
      username: msg.author.username,
      channel: msg.channel.id,
      content: msg.content,
      ts: new Date(),
    });
  } catch (e) {
    console.warn("Could not store message in DB:", e);
  }

  // Background processing (runs async)
  geminiBackground(`Summarize: "${msg.content}"`).catch(console.warn);
  // Add more background tasks if you want

  // Reply in public if bot is mentioned
  if (msg.mentions.has(client.user)) {
    try {
      const prompt = `You are Arbiter, a clever Discord AI bot. Reply conversationally to the user. Here’s their message: "${msg.content}"`;
      const { result, modelUsed } = await geminiUserFacing(prompt);
      await msg.reply(result);
    } catch (err) {
      console.error("Gemini user-facing failed:", err);
      await msg.reply("Couldn't generate a reply, sorry.");
    }
  }
});

// Run!
client.login(process.env.DISCORD_TOKEN);
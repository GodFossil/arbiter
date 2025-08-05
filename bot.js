require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { connect } = require("./mongo");
const { geminiUserFacing, geminiBackground } = require("./gemini");

/* ----- Minimal express keepalive server (for Render/UptimeRobot) ----- */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => res.send('Arbiter Discord bot - OK'));
app.listen(PORT, () => console.log(`Keepalive server running on port ${PORT}`));

/* ----- Discord client setup ----- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

/* ----- Channel whitelist logic (if set) ----- */
const CHANNEL_ID_WHITELIST = process.env.CHANNEL_ID_WHITELIST
  ? process.env.CHANNEL_ID_WHITELIST.split(',').map(s => s.trim()).filter(Boolean)
  : null;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

/* ----- Main message handler ----- */
client.on("messageCreate", async (msg) => {
  // Ignore self and DMs
  if (msg.author.bot || msg.channel.type !== 0) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // Store every message in Mongo
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
    console.warn("DB insert error:", e);
  }

  // Trigger background processing (does NOT reply or "typing")
  geminiBackground(`Summarize: "${msg.content}"`).catch(console.warn);
  // Add more background task calls here as needed

  // Only respond to direct mentions (with a reply)
  if (msg.mentions.has(client.user)) {
    try {
      // Show "bot is typing…" while generating response
      await msg.channel.sendTyping();

      const prompt = `You are Arbiter, a clever Discord AI bot. Reply conversationally to the user. Here’s their message: "${msg.content}"`;
      const { result, modelUsed } = await geminiUserFacing(prompt);
      await msg.reply(result);

    } catch (err) {
      console.error("Gemini user-facing failed:", err);
      await msg.reply("Couldn't generate a reply, sorry.");
    }
  }
});

// Start the bot!
client.login(process.env.DISCORD_TOKEN);
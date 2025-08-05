require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { connect } = require("./mongo");
const { geminiUserFacing, geminiBackground } = require("./gemini");
const { exaWebSearch } = require("./exa");

// Minimal Express keepalive server for Render/UptimeRobot
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Arbiter Discord bot - OK'));
app.listen(PORT, () => console.log(`Keepalive server running on port ${PORT}`));

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const CHANNEL_ID_WHITELIST = process.env.CHANNEL_ID_WHITELIST
  ? process.env.CHANNEL_ID_WHITELIST.split(',').map(s => s.trim()).filter(Boolean)
  : null;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
  // Ignore other bots and DMs
  if (msg.author.bot || msg.channel.type !== 0) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // Store every message in MongoDB
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

  // ------------ BACKGROUND PROCESSING SECTION ------------
  // All background processing uses gemini-2.5-flash-lite and/or Exa
  
  (async () => {
    // 1. Web Search with Exa to get context for fact-checking
    const exaResults = await exaWebSearch(msg.content, 5);

    // 2. Compose a concise context for Gemini
    let context = '';
    if (exaResults.length > 0) {
      context = exaResults
        .slice(0, 3)
        .map(r => `Title: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.text}`)
        .join("\n\n");
    }

    // 3. Fact-check and contradiction detection
    if (context) {
      const factCheckPrompt = `
Message: "${msg.content}"
Web context:
${context}

Does the message contain likely misinformation or contradiction compared to context? Respond with "yes" or "no" and one short sentence. Keep it brief.`;

      try {
        const { result } = await geminiBackground(factCheckPrompt);
        // Optional: Save check result in MongoDB
        const db = await connect();
        const checks = db.collection("fact_checks");
        await checks.insertOne({
          msgId: msg.id,
          user: msg.author.id,
          content: msg.content,
          exaResults,
          geminiResult: result,
          checkedAt: new Date()
        });
      } catch (e) {
        console.warn("Fact-check background task failed:", e);
      }
    }

    // 4. Summarization (optional, also with flash-lite)
    try {
      const { result } = await geminiBackground(`Summarize: "${msg.content}"\nKeep summarization short, just main point.`);
      // You can store or use `result` as you wish (optional)
    } catch (e) {
      // intentionally silent
    }
    // Add more background processing/tasks here as wanted
  })();

  // ------------ USER-FACING RESPONSE SECTION ------------
  // Only if bot is mentioned, uses gemini-2.5-pro w/ fallback to flash

  if (msg.mentions.has(client.user)) {
    try {
      await msg.channel.sendTyping();

      const prompt = `Reply concisely and clearly, using the fewest words possible, to the following user message:
"${msg.content}"`;

      const { result } = await geminiUserFacing(prompt);
      await msg.reply(result);

    } catch (err) {
      console.error("Gemini user-facing failed:", err);
      await msg.reply("Can't reply right now.");
    }
  }

});

client.login(process.env.DISCORD_TOKEN);
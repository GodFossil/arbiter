require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { connect } = require("./mongo");
const { geminiUserFacing, geminiBackground } = require("./gemini");
const { exaWebSearch, exaNewsSearch } = require("./exa");

// Express keepalive for Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Arbiter Discord bot - OK'));
app.listen(PORT, () => console.log(`Keepalive server running on port ${PORT}`));

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

/**
 * Fetch last N user messages in this channel
 */
async function fetchUserHistory(userId, channelId, limit = 5) {
  const db = await connect();
  return await db.collection("messages")
    .find({ user: userId, channel: channelId })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Fetch last K channel messages, including bots
 */
async function fetchChannelHistory(channelId, limit = 7) {
  const db = await connect();
  return await db.collection("messages")
    .find({ channel: channelId, content: { $exists: true } })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== 0) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // Store all user messages in MongoDB
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

  // ------------ BACKGROUND TASKS ------------
  (async () => {
    const exaResults = await exaWebSearch(msg.content, 5);
    let context = '';
    if (exaResults.length > 0) {
      context = exaResults
        .slice(0, 3)
        .map(r => `Title: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.text}`)
        .join("\n\n");
    }
    if (context) {
      const factCheckPrompt = `
Message: "${msg.content}"
Web context:
${context}
Does the message contain likely misinformation or contradiction compared to context? Respond with 'yes' or 'no' and one short sentence. Keep it brief.`;
      try {
        const { result } = await geminiBackground(factCheckPrompt);
        const db = await connect();
        await db.collection("fact_checks").insertOne({
          msgId: msg.id,
          user: msg.author.id,
          content: msg.content,
          exaResults,
          geminiResult: result,
          checkedAt: new Date()
        });
      } catch (e) { /* ignore */ }
    }
    // Summarization (optional)
    try {
      await geminiBackground(`Summarize: "${msg.content}"\nKeep summarization short, just main point.`);
    } catch (e) { /* intentionally silent */ }
  })();

  // ------------ USER-FACING: SMART, CONTEXTUAL, BOT-AWARE ------------
  if (msg.mentions.has(client.user)) {
    try {
      await msg.channel.sendTyping();

      // Fetch user memory, channel memory including bot
      const [userHistoryArr, channelHistoryArr] = await Promise.all([
        fetchUserHistory(msg.author.id, msg.channel.id, 5),
        fetchChannelHistory(msg.channel.id, 7)
      ]);

      const userHistory = userHistoryArr.length
        ? userHistoryArr.map(m => `You: ${m.content}`).reverse().join("\n")
        : '';

      const channelHistory = channelHistoryArr.length
        ? channelHistoryArr.reverse().map(m => {
            if (m.user === msg.author.id) return `You: ${m.content}`;
            if (m.user === client.user.id) return `Bot: ${m.content}`;
            return (m.username || "User") + ": " + m.content;
          }).join("\n")
        : '';

      // Date for prompt
      const dateString = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

      // News detection
      const newsRegex = /\b(news|headline|latest|article|current event|today)\b/i;
      let newsSection = "";
      if (newsRegex.test(msg.content)) {
        let topic = "world events";
        const match = msg.content.match(/news (about|on|regarding) (.+)$/i);
        if (match) topic = match[2];
        const exaNews = await exaNewsSearch(topic, 3);
        if (exaNews.length) {
          const newsSnippets = exaNews
            .map(r => `• ${r.title.trim()} (${r.url})\n${r.text.trim().slice(0,160)}...`)
            .join("\n");
          newsSection = `Here are concise, real-time news results for "${topic}":\n${newsSnippets}\n`;
        } else {
          newsSection = "No up-to-date news articles found for that topic.";
        }
      }

      // Build concise prompt
      let prompt = `Today is ${dateString}.
Reply concisely. Use recent context from user, bot, and others below if relevant. If [news] is present, focus on those results.
[user history]\n${userHistory}
[channel context]\n${channelHistory}
${newsSection ? `[news]\n${newsSection}` : ""}
[user message]\n"${msg.content}"
[bot reply]
`;

      // Generate Gemini response
      const { result } = await geminiUserFacing(prompt);
      await msg.reply(result);

      // --- Store bot response in Mongo as a message for context ---
      try {
        const db = await connect();
        await db.collection("messages").insertOne({
          user: client.user.id,
          username: client.user.username || "Arbiter",
          channel: msg.channel.id,
          content: result,
          ts: new Date()
        });
      } catch (e) {
        console.warn("DB insert error (bot reply):", e);
      }
    } catch (err) {
      console.error("Gemini user-facing failed:", err);
      try {
        await msg.reply("Can't fetch info right now.");
      } catch (e) {}
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
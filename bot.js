require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { connect } = require("./mongo");
const {
  geminiFlashFactCheck,
  geminiProFactCheck,
  shouldUseGeminiPro,
  incrementGeminiProUsage,
} = require("./gemini");
const { exaWebSearch, exaNewsSearch } = require("./exa");

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Arbiter Discord bot - OK'));
app.listen(PORT, () => console.log(`Keepalive server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const CHANNEL_ID_WHITELIST = process.env.CHANNEL_ID_WHITELIST
  ? process.env.CHANNEL_ID_WHITELIST.split(',').map(s => s.trim()).filter(Boolean)
  : null;

async function fetchUserHistory(userId, channelId, limit = 5) {
  const db = await connect();
  return await db.collection("messages")
    .find({ user: userId, channel: channelId })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

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

// ---- FACTCHECK - MULTI-LAYER LOGIC ----
async function handleFactChecking(msg) {
  // 1. Gather search context
  let exaResults = [];
  try {
    exaResults = await exaWebSearch(msg.content, 5);
  } catch {}
  let context = '';
  if (exaResults.length > 0) {
    context = exaResults
      .slice(0, 3)
      .map(r => `Title: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.text}`)
      .join("\n\n");
  }
  if (!context) return;

  // 2. FAST (FLASH) FACT CHECK
  const flashResult = await geminiFlashFactCheck(msg.content, context);
  if (!flashResult.flag || flashResult.confidence < 0.7) return;

  // 3. PRO ESCALATION IF ENOUGH BUDGET (otherwise, fallback to high-confidence Flash)
  let finalCheck = flashResult;
  if (shouldUseGeminiPro()) {
    const proResult = await geminiProFactCheck(msg.content, context, flashResult.type);
    incrementGeminiProUsage();
    if (proResult.flag && proResult.confidence > 0.85) {
      finalCheck = proResult;
    } else {
      // Pro did not confirm, skip announcing/reporting/auditing this flag
      return;
    }
  }
  // Store in DB, optionally notify mods/channel
  try {
    const db = await connect();
    await db.collection("fact_checks").insertOne({
      msgId: msg.id,
      user: msg.author.id,
      content: msg.content,
      exaResults,
      factCheck: finalCheck,
      checkedAt: new Date(),
    });
  } catch (e) {}

  try {
    if (finalCheck.confidence > 0.85) {
      await msg.reply(
        `⚠️ Possible misinformation or logical problem detected (${finalCheck.type || 'unspecified'}):\n` +
        `> ${finalCheck.reason}\n_Context: (automated check, may be imperfect)_`
      );
    }
  } catch {}
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== 0) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // Store all user messages
  try {
    const db = await connect();
    await db.collection("messages").insertOne({
      user: msg.author.id,
      username: msg.author.username,
      channel: msg.channel.id,
      content: msg.content,
      ts: new Date(),
    });
  } catch {}

  // --- Run background fact checking and automated logic ---
  handleFactChecking(msg);

  // --- USER-FACING (@Arbiter) ---
  if (msg.mentions.has(client.user)) {
    try {
      await msg.channel.sendTyping();
      const [userHistoryArr, channelHistoryArr] = await Promise.all([
        fetchUserHistory(msg.author.id, msg.channel.id, 5),
        fetchChannelHistory(msg.channel.id, 7),
      ]);
      const userHistory = userHistoryArr.length
        ? userHistoryArr.map(m => `You: ${m.content}`).reverse().join("\n")
        : '';
      const channelHistory = channelHistoryArr.length
        ? channelHistoryArr.reverse().map(m => {
            if (m.user === msg.author.id) return `You: ${m.content}`;
            if (m.user === client.user.id) return `I: ${m.content}`;
            return (m.username || "User") + ": " + m.content;
          }).join("\n")
        : '';
      const dateString = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

      let newsSection = "";
      const newsRegex = /\b(news|headline|latest|article|current event|today)\b/i;
      if (newsRegex.test(msg.content)) {
        let topic = "world events";
        const match = msg.content.match(/news (about|on|regarding) (.+)$/i);
        if (match) topic = match[2];
        try {
          const exaNews = await exaNewsSearch(topic, 3);
          if (exaNews.length) {
            newsSection = `Here are concise, real-time news results for "${topic}":\n` +
              exaNews.map(r => `• ${r.title.trim()} (${r.url})\n${r.text.trim().slice(0,160)}...`).join("\n") + "\n";
          } else newsSection = "No up-to-date news articles found for that topic.";
        } catch { newsSection = "Unable to retrieve news results right now."; }
      }

      const prompt =
        `Today is ${dateString}.\n` +
        `Reply concisely. Use recent context from user, me ("I:"), and others below if relevant. If [news] is present, focus on those results. When describing your past actions, use "I" or "me" instead of "the bot."\n` +
        `[user history]\n${userHistory}\n[channel context]\n${channelHistory}\n${newsSection ? `[news]\n${newsSection}` : ""}\n` +
        `[user message]\n"${msg.content}"\n[reply]`;

      // Pro for user, fallback to Flash if out of quota
      let result;
      if (shouldUseGeminiPro()) {
        result = await geminiProFactCheck(prompt, "", "response");
        incrementGeminiProUsage();
      } else {
        result = await geminiFlashFactCheck(prompt, "", "response");
      }

      await msg.reply(result.reason || result);

      // Store bot response as context for future
      try {
        const db = await connect();
        await db.collection("messages").insertOne({
          user: client.user.id,
          username: client.user.username || "Arbiter",
          channel: msg.channel.id,
          content: result.reason || result,
          ts: new Date(),
        });
      } catch {}
    } catch (err) {
      try { await msg.reply("Can't fetch info right now."); } catch {}
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
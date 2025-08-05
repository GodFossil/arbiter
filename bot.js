require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { connect } = require("./mongo");
const {
  geminiFlashFactCheck
} = require("./gemini");
const { exaWebSearch, exaNewsSearch } = require("./exa");

// Print loaded environment variables for debugging
console.log("ENV:", {
  DISCORD_TOKEN: !!process.env.DISCORD_TOKEN,
  GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
  GEMINI_API_URL: process.env.GEMINI_API_URL,
  EXA_API_KEY: !!process.env.EXA_API_KEY,
  EXA_API_URL: process.env.EXA_API_URL,
  MONGODB_URI: process.env.MONGODB_URI,
  CHANNEL_ID_WHITELIST: process.env.CHANNEL_ID_WHITELIST,
});

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

// ---------- History Fetch Functions ----------
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

// ---------- On Ready ----------
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// ---------- Fact Checking Pipeline ----------
async function handleFactChecking(msg) {
  let exaResults = [];
  try {
    exaResults = await exaWebSearch(msg.content, 5);
    console.log("Exa results:", exaResults);
  } catch (e) {
    console.error("Exa search error (background):", e);
  }
  let context = '';
  if (exaResults.length > 0) {
    context = exaResults
      .slice(0, 3)
      .map(r => `Title: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.text}`)
      .join("\n\n");
  }
  if (!context) return;
  let flashResult;
  try {
    flashResult = await geminiFlashFactCheck(msg.content, context);
    console.log("Gemini Flash fact check:", flashResult);
  } catch (e) {
    console.error("Gemini Flash error:", e);
    return;
  }
  if (!flashResult.flag || flashResult.confidence < 0.7) return;
  // No Pro escalation – just use the flashResult
  let finalCheck = flashResult;
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
  } catch (e) {
    console.error("DB error (fact_checks):", e);
  }
  try {
    if (finalCheck.confidence > 0.85) {
      await msg.reply(
        `⚠️ Possible misinformation or logical problem detected (${finalCheck.type || 'unspecified'}):\n` +
        `> ${finalCheck.reason}\n_Context: (automated check, may be imperfect)_`
      );
    }
  } catch (e) {
    console.error("Error sending factcheck reply:", e);
  }
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
  } catch (e) {
    console.error("DB error (messages):", e);
  }

  // --- Run background fact checking and automated logic ---
  handleFactChecking(msg).catch(e => console.error("Factcheck pipeline error:", e));

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
          console.log("User-facing news search:", exaNews);
          if (exaNews.length) {
            newsSection = `Here are concise, real-time news results for "${topic}":\n` +
              exaNews.map(r => `• ${r.title.trim()} (${r.url})\n${r.text.trim().slice(0,160)}...`).join("\n") + "\n";
          } else newsSection = "No up-to-date news articles found for that topic.";
        } catch (e) {
          newsSection = "Unable to retrieve news results right now.";
          console.error("News fetch error:", e);
        }
      }
      const prompt =
        `Today is ${dateString}.\n` +
        `Reply concisely. Use recent context from user, me ("I:"), and others below if relevant. If [news] is present, focus on those results. When describing your past actions, use "I" or "me" instead of "the bot."\n` +
        `[user history]\n${userHistory}\n[channel context]\n${channelHistory}\n${newsSection ? `[news]\n${newsSection}` : ""}\n` +
        `[user message]\n"${msg.content}"\n[reply]`;

      // Only Flash (no Pro)
      let result;
      try {
        result = await geminiFlashFactCheck(prompt, "", "response");
        console.log("Gemini Flash response (user):", result);
      } catch (gemErr) {
        console.error("Gemini API failure (user-facing):", gemErr);
        throw gemErr;
      }

      // ----------- SAFEGUARD FOR EMPTY REPLIES -------------
      let replyContent = (typeof result === 'object' && result !== null)
        ? (result.reason || result.result || "")
        : (result || "");
      if (!replyContent || !replyContent.trim() || replyContent.trim() === "{}") {
        console.error("Gemini API returned unusable/empty reply:", result);
        replyContent = "Sorry, I couldn't generate a reply just now.";
      }
      await msg.reply(replyContent);

      // Store bot response as context for future
      try {
        const db = await connect();
        await db.collection("messages").insertOne({
          user: client.user.id,
          username: client.user.username || "Arbiter",
          channel: msg.channel.id,
          content: replyContent,
          ts: new Date(),
        });
      } catch (e) {
        console.error("DB error (bot messages):", e);
      }
    } catch (err) {
      console.error("Error in user-facing Gemini reply:", err);
      try { await msg.reply("Can't fetch info right now."); } catch (replyErr) {
        console.error("Error sending fallback reply:", replyErr);
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
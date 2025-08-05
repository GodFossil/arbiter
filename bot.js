require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");
const { connect } = require("./mongo");
const { geminiUserFacing, geminiBackground } = require("./gemini");
const { exaWebSearch, exaNewsSearch } = require("./exa");

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

// -------- Caching, Limits, and Summaries ---------
const historyCache = { user: new Map(), channel: new Map() };
const HISTORY_TTL_MS = 4000; // Cache interval
const MAX_CONTEXT_MESSAGES_PER_CHANNEL = 50; // Limit for full messages
const SUMMARY_BLOCK_SIZE = 10; // How many messages to summarize at a time

async function fetchUserHistory(userId, channelId, limit = 5) {
  const key = `${userId}:${channelId}:${limit}`;
  const now = Date.now();
  const cached = historyCache.user.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) {
    return cached.data;
  }
  const db = await connect();
  const data = await db.collection("messages")
    .find({ type: "message", user: userId, channel: channelId })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
  historyCache.user.set(key, { time: now, data });
  return data;
}

async function fetchChannelHistory(channelId, limit = 7) {
  const key = `${channelId}:${limit}`;
  const now = Date.now();
  const cached = historyCache.channel.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) {
    return cached.data;
  }
  const db = await connect();
  // Fetch both recent full messages and recent summaries
  const [full, summaries] = await Promise.all([
    db.collection("messages")
      .find({ type: "message", channel: channelId, content: { $exists: true } })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray(),
    db.collection("messages")
      .find({ type: "summary", channel: channelId })
      .sort({ ts: -1 })
      .limit(3)
      .toArray()
  ]);
  // Merge summaries then messages (chronologically)
  const result = [...summaries.reverse(), ...full.reverse()];
  historyCache.channel.set(key, { time: now, data: result });
  return result;
}

async function saveUserMessage(msg) {
  const db = await connect();
  // Insert the new message
  await db.collection("messages").insertOne({
    type: "message",
    user: msg.author.id,
    username: msg.author.username,
    channel: msg.channel.id,
    content: msg.content,
    ts: new Date(),
  });

  // Prune if over limit (preserve only newest N)
  const count = await db.collection("messages").countDocuments({
    type: "message", channel: msg.channel.id
  });
  if (count > MAX_CONTEXT_MESSAGES_PER_CHANNEL) {
    const toSummarize = await db.collection("messages")
      .find({ type: "message", channel: msg.channel.id })
      .sort({ ts: 1 })
      .limit(SUMMARY_BLOCK_SIZE)
      .toArray();
    if (toSummarize.length > 0) {
      const summaryPrompt = `
Summarize briefly the main interactions, themes and points of the following Discord channel messages. Ignore spam and greetings.
Messages:
${toSummarize.map(m => `${m.username}: ${m.content}`).join("\n")}
Summary:
`.trim();
      let summary = "";
      try {
        const { result } = await geminiBackground(summaryPrompt, { modelOverride: "gemini-2.5-flash-lite" });
        summary = result;
      } catch (e) {
        summary = "[failed to summarize]";
        console.warn("Summary error:", e);
      }
      await db.collection("messages").insertOne({
        type: "summary",
        channel: msg.channel.id,
        startTs: toSummarize[0].ts,
        endTs: toSummarize[toSummarize.length - 1].ts,
        summary,
        ts: new Date()
      });
      // Remove the summarized block
      await db.collection("messages").deleteMany({
        _id: { $in: toSummarize.map(m => m._id) }
      });
    }
  }
}

/** Utility for cheap LLM */
async function geminiFlash(prompt, opts) {
  return await geminiBackground(prompt, { ...opts, modelOverride: "gemini-2.5-flash-lite" });
}

// ----------------- CONTRADICTION/MISINFO DETECTION -----------------
async function detectContradictionOrMisinformation(msg) {
  const db = await connect();
  // 1. Check if user has history in this channel (last 10 messages)
  const userMessages = await db.collection("messages")
    .find({ type: "message", user: msg.author.id, channel: msg.channel.id, _id: { $ne: msg.id } })
    .sort({ ts: -1 })
    .limit(10)
    .toArray();

  // 2. Contradiction with user's own history
  let contradiction = null;
  if (userMessages.length > 0) {
    const concatenated = userMessages.map(m => `${m.content}`).reverse().join("\n");
    const contradictionPrompt = `
You are a careful contradiction detector.
Compare the [Previous statements] and the [New message] from the *same user* below.
Is there a direct contradiction? Only reply in JSON:
{"contradiction":"yes"|"no", "evidence":"...", "reason":"..."}
[Previous statements]
${concatenated}
[New message]
${msg.content}
`.trim();
    try {
      const { result } = await geminiFlash(contradictionPrompt);
      let parsed = null;
      try {
        const match = result.match(/\{[\s\S]*?\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch {}
      if (parsed && parsed.contradiction === "yes") {
        contradiction = parsed;
      }
    } catch (e) {
      console.warn("Contradiction detection error:", e);
    }
  }

  // 3. Misinformation check, only if no contradiction
  let misinformation = null;
  if (!contradiction) {
    const exaResults = await exaWebSearch(msg.content, 5);
    let context = "";
    if (exaResults && exaResults.length > 0) {
      context = exaResults
        .slice(0, 3)
        .map((r, i) => `Result #${i + 1} | Title: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.text}`)
        .join("\n\n");
    }
    if (context) {
      const misinfoPrompt = `
You are a careful fact-checking assistant.
Does the [User message] contain blatant misinformation, as shown by contradiction with the [Web context]? Only respond when the message contains **misinformation**. Do not reply if the message is true, neutral, or off-topic.

Output strict JSON, only if there is *blatant* misinformation:
{"misinformation":"yes", "reason":"...", "evidence":"..."}
[User message]
${msg.content}
[Web context]
${context}
`.trim();

      try {
        const { result } = await geminiFlash(misinfoPrompt);
        let parsed = null;
        try {
          const match = result.match(/\{[\s\S]*?\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch {}
        if (parsed && parsed.misinformation === "yes") {
          misinformation = parsed;
        }
      } catch (e) {
        console.warn("Misinformation detection error:", e);
      }
    }
  }

  return { contradiction, misinformation };
}

// ===================== MAIN BOT HANDLER ==========================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== ChannelType.GuildText) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // Store message in DB (scalable with summaries)
  try {
    await saveUserMessage(msg);
  } catch (e) {
    console.warn("DB store/prune error:", e);
  }

  // Respond if: (1) mentioned, (2) replied directly to a bot message,
  // or (3) detected contradiction/misinformation (handled later)
  const isMentioned = msg.mentions.has(client.user);

  // ONLY respond to reply if it's a reply to the bot
  let isReplyToBot = false;
  if (msg.reference && msg.reference.messageId) {
    try {
      const repliedToMsg = await msg.channel.messages.fetch(msg.reference.messageId);
      if (repliedToMsg.author.id === client.user.id) {
        isReplyToBot = true;
      }
    } catch (e) {
      isReplyToBot = false;
      console.warn("Failed to fetch replied-to message:", e);
    }
  }

  // -- Contradiction/Misinfo detector in the background --
  (async () => {
    let detection = null;
    try {
      detection = await detectContradictionOrMisinformation(msg);
    } catch (e) {
      console.warn("Detection failure:", e);
    }

    // Respond only if contradiction (by same user) or blatant misinfo is found
    if (detection) {
      if (detection.contradiction) {
        try {
          await msg.reply(
            `⚡ **CONTRADICTION DETECTED** ⚡\n` +
            `This message contradicts a prior statement you made:\n` +
            `> ${detection.contradiction.evidence}\n` +
            `Reason: ${detection.contradiction.reason}`
          );
        } catch {}
      } else if (detection.misinformation) {
        try {
          await msg.reply(
            `🚩 **MISINFORMATION DETECTED** 🚩\n` +
            `Reason: ${detection.misinformation.reason}\n` +
            (detection.misinformation.evidence ? `Evidence: ${detection.misinformation.evidence}` : "")
          );
        } catch {}
      }
    }
  })();

  // -- ONLY reply conversationally if mentioned or replied to (just bot) --
  if (isMentioned || isReplyToBot) {
    try {
      await msg.channel.sendTyping();

      let userHistoryArr = null, channelHistoryArr = null, userHistory = "", channelHistory = "";
      try {
        userHistoryArr = await fetchUserHistory(msg.author.id, msg.channel.id, 5);
      } catch (e) {
        userHistoryArr = null;
        try { await msg.reply(`Could not fetch your recent message history: \`${e.message}\``); } catch {}
        console.warn("Fetch user history failed:", e);
      }
      try {
        channelHistoryArr = await fetchChannelHistory(msg.channel.id, 7);
      } catch (e) {
        channelHistoryArr = null;
        try { await msg.reply(`Could not fetch channel message history: \`${e.message}\``); } catch {}
        console.warn("Fetch channel history failed:", e);
      }
      if (!userHistoryArr || !channelHistoryArr) {
        try {
          await msg.reply("Not enough message history available for a quality reply. Please try again in a moment.");
        } catch {}
        return;
      }

      userHistory = userHistoryArr.length
        ? userHistoryArr.map(m => `You: ${m.content}`).reverse().join("\n")
        : '';
      channelHistory = channelHistoryArr.length
        ? channelHistoryArr.map(m => {
            if (m.type === "summary") return `[SUMMARY] ${m.summary}`;
            if (m.user === msg.author.id) return `You: ${m.content}`;
            if (m.user === client.user.id) return `I: ${m.content}`;
            return (m.username || "User") + ": " + m.content;
          }).join("\n")
        : '';
      const dateString = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

      // News detection
      let newsSection = "";
      try {
        const newsRegex = /\b(news|headline|latest|article|current event|today)\b/i;
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
      } catch (e) {
        newsSection = `News search failed: \`${e.message}\``;
      }

      const prompt = `Today is ${dateString}.
Reply concisely. Use recent context from user, me ("I:"), and others below if relevant. Include [SUMMARY]s if they help. If [news] is present, focus on those results. When describing your past actions, use "I" or "me" instead of "the bot."
[user history]
${userHistory}
[channel context]
${channelHistory}
${newsSection ? `[news]\n${newsSection}` : ""}
[user message]
"${msg.content}"
[reply]
`;

      let replyText;
      try {
        const { result } = await geminiUserFacing(prompt);
        replyText = result;
      } catch (e) {
        replyText = `AI reply failed: \`${e.message}\``;
      }

      try {
        await msg.reply(replyText);
      } catch (e) {
        console.error("Discord reply failed:", e);
      }

      // Store bot reply in Mongo
      try {
        const db = await connect();
        await db.collection("messages").insertOne({
          type: "message",
          user: client.user.id,
          username: client.user.username || "Arbiter",
          channel: msg.channel.id,
          content: replyText,
          ts: new Date()
        });
      } catch (e) {
        console.warn("DB insert error (bot reply):", e);
      }
    } catch (err) {
      try {
        await msg.reply(`Something went wrong: \`${err.message}\``);
      } catch {}
      console.error("Gemini user-facing failed:", err);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
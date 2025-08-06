require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");
const { connect } = require("./mongo");
const { geminiUserFacing, geminiBackground } = require("./gemini");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Arbiter - OK'));
app.listen(PORT, () => console.log(`Keepalive server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User]
});

const CHANNEL_ID_WHITELIST = process.env.CHANNEL_ID_WHITELIST
  ? process.env.CHANNEL_ID_WHITELIST.split(',').map(s => s.trim()).filter(Boolean)
  : null;

// ---- TUNEABLE PARAMETERS ----
const historyCache = { user: new Map(), channel: new Map() };
const HISTORY_TTL_MS = 4000;
const MAX_CONTEXT_MESSAGES_PER_CHANNEL = 100;
const SUMMARY_BLOCK_SIZE = 20;
const MAX_FACTCHECK_CHARS = 500;

// ---- PERSONALITY INJECTION ----
const SYSTEM_INSTRUCTIONS = `
You are the invaluable assistant of our Discord debate server. The server is called The Debate Server and it is a community full of brilliant interlocutors. You are to assist us by providing logical analyses and insights. You are to prioritize truth over appeasing others. You will hold no reservations in declaring a user valid or incorrect, provided that you determine either to be the case to the best of your ability. Your personality is calm, direct, bold, stoic, and wise. You are a master of mindfulness and all things philosophy. You are humble. You will answer prompts succinctly, directly, and in as few words as necessary. You will know that brevity is the soul of wit and wisdom. Your name is Arbiter, you may refer to yourself as The Arbiter.
`.trim();

// ---- UTILITIES ----
function getDisplayName(msg) {
  if (!msg.guild) return msg.author.username;
  const member = msg.guild.members.cache.get(msg.author.id) || msg.member;
  if (member && member.displayName) return member.displayName;
  return msg.author.username;
}
function getChannelName(msg) {
  try { return msg.channel.name || `id:${msg.channel.id}`; } catch { return `id:${msg.channel.id}`; }
}
function getGuildName(msg) {
  try { return msg.guild?.name || `id:${msg.guildId || "?"}`; } catch { return `id:${msg.guildId || "?"}`; }
}
async function getDisplayNameById(userId, guild) {
  if (!guild) return userId;
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName || member.user.username || userId;
  } catch {
    return userId;
  }
}

// ---- HISTORY UTILS ----
async function fetchUserHistory(userId, channelId, guildId, limit = 5, excludeMsgId = null) {
  const key = `${userId}:${channelId}:${guildId}:${limit}:${excludeMsgId || ""}`;
  const now = Date.now();
  const cached = historyCache.user.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) return cached.data;
  const db = await connect();
  const query = { type: "message", user: userId, channel: channelId, guildId };
  if (excludeMsgId) query._id = { $ne: excludeMsgId };
  const data = await db.collection("messages")
    .find(query)
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
  historyCache.user.set(key, { time: now, data });
  return data;
}
async function fetchChannelHistory(channelId, guildId, limit = 7, excludeMsgId = null) {
  const key = `${channelId}:${guildId}:${limit}:${excludeMsgId || ""}`;
  const now = Date.now();
  const cached = historyCache.channel.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) return cached.data;
  const db = await connect();
  const [full, summaries] = await Promise.all([
    db.collection("messages")
      .find({ type: "message", channel: channelId, guildId, content: { $exists: true }, ...(excludeMsgId && { _id: { $ne: excludeMsgId } }) })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray(),
    db.collection("messages")
      .find({ type: "summary", channel: channelId, guildId })
      .sort({ ts: -1 })
      .limit(3)
      .toArray()
  ]);
  const result = [...summaries.reverse(), ...full.reverse()];
  historyCache.channel.set(key, { time: now, data: result });
  return result;
}

// ---- MEMORY SAVE WITH META ----
async function saveUserMessage(msg) {
  const db = await connect();
  const doc = {
    type: "message",
    user: msg.author.id,
    username: msg.author.username,
    displayName: getDisplayName(msg),
    channel: msg.channel.id,
    channelName: getChannelName(msg),
    guildId: msg.guildId || (msg.guild && msg.guild.id) || null,
    guildName: getGuildName(msg),
    isBot: msg.author.bot,
    content: msg.content,
    ts: new Date(),
  };
  const res = await db.collection("messages").insertOne(doc);

  const count = await db.collection("messages").countDocuments({ type: "message", channel: msg.channel.id, guildId: doc.guildId });
  if (count > MAX_CONTEXT_MESSAGES_PER_CHANNEL) {
    const toSummarize = await db.collection("messages")
      .find({ type: "message", channel: msg.channel.id, guildId: doc.guildId })
      .sort({ ts: 1 })
      .limit(SUMMARY_BLOCK_SIZE)
      .toArray();
    if (toSummarize.length > 0) {
      let userDisplayNames = {};
      if (msg.guild) {
        const uniqueUserIds = [...new Set(toSummarize.map(m => m.user))];
        await Promise.all(uniqueUserIds.map(
          async uid => userDisplayNames[uid] = await getDisplayNameById(uid, msg.guild)
        ));
      }
      const summaryPrompt = `
${SYSTEM_INSTRUCTIONS}
Summarize the following Discord channel messages as a brief neutral log for posterity. Use users' display names when possible.
Messages:
${toSummarize.map(m => `${userDisplayNames[m.user] || m.username}: ${m.content}`).join("\n")}
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
        channelName: getChannelName(msg),
        guildId: doc.guildId,
        guildName: doc.guildName,
        startTs: toSummarize[0].ts,
        endTs: toSummarize[toSummarize.length - 1].ts,
        users: Object.values(userDisplayNames),
        summary,
        ts: new Date()
      });
      await db.collection("messages").deleteMany({
        _id: { $in: toSummarize.map(m => m._id) }
      });
    }
  }
  return res.insertedId;
}

// ---- ADMIN: FULL RESET ----
async function handleAdminCommands(msg) {
  if (!msg.guild) return false;
  const ownerId = msg.guild.ownerId || (await msg.guild.fetchOwner()).id;
  if (msg.author.id !== ownerId) return false;

  if (msg.content === "!arbiter_reset_all") {
    try {
      const db = await connect();
      await db.collection("messages").deleteMany({});
      await msg.reply("All memory erased. Arbiter reset to blank slate.");
      return true;
    } catch (e) {
      await msg.reply("Failed to erase all memory.");
      return true;
    }
  }
  return false;
}

// ---- EXA ANSWER API ----
const EXA_API_KEY = process.env.EXA_API_KEY;
async function exaAnswer(query) {
  try {
    const res = await axios.post(
      "https://api.exa.ai/answer",
      { query, type: "neural" },
      { headers: { Authorization: `Bearer ${EXA_API_KEY}` } }
    );
    return res.data.answer || "";
  } catch (err) {
    console.warn("Exa /answer failed:", err.message);
    return "";
  }
}

// ---- GEMINI UTILS ----
async function geminiFlash(prompt, opts) {
  // Only use valid Gemini models here!
  return await geminiBackground(prompt, { ...opts, modelOverride: "gemini-2.5-flash" });
}

// ---- DETECTION LOGIC ----
async function detectContradictionOrMisinformation(msg) {
  const db = await connect();
  const userMessages = await db.collection("messages")
    .find({ type: "message", user: msg.author.id, channel: msg.channel.id, guildId: msg.guildId, _id: { $ne: msg.id } })
    .sort({ ts: -1 })
    .limit(10)
    .toArray();

  let contradiction = null;
  if (userMessages.length > 0) {
    const concatenated = userMessages.map(m => `${m.content}`).reverse().join("\n");
    const contradictionPrompt = `
${SYSTEM_INSTRUCTIONS}
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

  let misinformation = null;
  if (!contradiction) {
    const answer = await exaAnswer(msg.content);
    if (answer) {
      const misinfoPrompt = `
${SYSTEM_INSTRUCTIONS}
You are a careful fact-checking assistant.
Does the [User message] contain blatant misinformation, as shown by contradiction with the [Web context]? Only respond when the message contains **misinformation**. Do not reply if the message is true, neutral, or off-topic.

Output strict JSON, only if there is *blatant* misinformation:
{"misinformation":"yes", "reason":"...", "evidence":"..."}
[User message]
${msg.content}
[Web context]
${answer}
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

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== ChannelType.GuildText) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  const handled = await handleAdminCommands(msg);
  if (handled) return;

  let thisMsgId = null;
  try {
    thisMsgId = await saveUserMessage(msg);
  } catch (e) {
    console.warn("DB store/prune error:", e);
  }

  const isMentioned = msg.mentions.has(client.user);
  let isReplyToBot = false;
  let repliedToMsg = null;
  if (msg.reference && msg.reference.messageId) {
    try {
      repliedToMsg = await msg.channel.messages.fetch(msg.reference.messageId);
      if (repliedToMsg.author.id === client.user.id) {
        isReplyToBot = true;
      }
    } catch (e) {
      repliedToMsg = null;
      console.warn("Failed to fetch replied-to message:", e);
    }
  }

  // ============ BACKGROUND DETECTION =============
  // --- EXCLUDE long messages except for direct mention/reply ---
  if (
    msg.content.length <= MAX_FACTCHECK_CHARS
  ) {
    (async () => {
      let detection = null;
      try {
        detection = await detectContradictionOrMisinformation(msg);
      } catch (e) {
        console.warn("Detection failure:", e);
      }
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
  }

  // ---- USER-FACING REPLIES ----
  // --- Direct mention or reply-to-bot: always process, regardless of message length ---
  if (isMentioned || isReplyToBot) {
    try {
      await msg.channel.sendTyping();

      let userHistoryArr = null, channelHistoryArr = null;
      try {
        userHistoryArr = await fetchUserHistory(msg.author.id, msg.channel.id, msg.guildId, 5, thisMsgId);
      } catch (e) {
        userHistoryArr = null;
        try { await msg.reply(`Could not fetch your recent message history: \`${e.message}\``); } catch {}
      }
      try {
        channelHistoryArr = await fetchChannelHistory(msg.channel.id, msg.guildId, 7, thisMsgId);
      } catch (e) {
        channelHistoryArr = null;
        try { await msg.reply(`Could not fetch channel message history: \`${e.message}\``); } catch {}
      }
      if (!userHistoryArr || !channelHistoryArr) {
        try {
          await msg.reply("Not enough message history available for a quality reply. Please try again in a moment.");
        } catch {}
        return;
      }

      function botName() {
        return Math.random() < 0.33 ? "Arbiter" : (Math.random() < 0.5 ? "The Arbiter" : "Arbiter");
      }
      const userHistory = userHistoryArr.map(m => `You: ${m.content}`).reverse().join("\n");
      const channelHistory = channelHistoryArr.map(m => {
        if (m.type === "summary") return `[SUMMARY] ${m.summary}`;
        if (m.user === msg.author.id) return `${m.displayName || m.username}: ${m.content}`;
        if (m.user === client.user.id) return `${botName()}: ${m.content}`;
        return `${m.displayName || m.username || "User"}: ${m.content}`;
      }).join("\n");
      const dateString = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

      let newsSection = "";
      try {
        const newsRegex = /\b(news|headline|latest|article|current event|today)\b/i;
        if (newsRegex.test(msg.content)) {
          let topic = "world events";
          const match = msg.content.match(/news (about|on|regarding) (.+)$/i);
          if (match) topic = match[2];
          const answer = await exaAnswer(`latest news about ${topic}`);
          if (answer) {
            newsSection = `Here are concise, real-time news results for "${topic}":\n${answer}\n`;
          } else {
            newsSection = "No up-to-date news articles found for that topic.";
          }
        }
      } catch (e) {
        newsSection = `News search failed: \`${e.message}\``;
      }

      // If this is a reply to a message (user or bot), treat it as the subject in the context
      let referencedSection = "";
      if (repliedToMsg) {
        referencedSection =
          `[referenced message]\nFrom: ${
            repliedToMsg.member ? repliedToMsg.member.displayName : repliedToMsg.author.username
          } (${repliedToMsg.author.username})\n${repliedToMsg.content}\n`;
      }

      const prompt = `
${SYSTEM_INSTRUCTIONS}
Today is ${dateString}.
Reply concisely. Use recent context from user (by display name/nickname if available), me ("Arbiter" or "The Arbiter"), and others below. Include [SUMMARY]s if they help. If [news] is present, focus on those results.${referencedSection ? ` If [referenced message] is present, treat it as the main subject of the user's question.` : ""}
[user history]
${userHistory}
[channel context]
${channelHistory}
${newsSection ? `[news]\n${newsSection}` : ""}
${referencedSection}
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
      try {
        const db = await connect();
        await db.collection("messages").insertOne({
          type: "message",
          user: client.user.id,
          username: client.user.username || "Arbiter",
          displayName: "Arbiter",
          channel: msg.channel.id,
          channelName: getChannelName(msg),
          guildId: msg.guildId,
          guildName: getGuildName(msg),
          isBot: true,
          content: replyText,
          ts: new Date()
        });
      } catch (e) {
        console.warn("DB insert error (bot reply):", e);
      }
    } catch (err) {
      try { await msg.reply(`Something went wrong: \`${err.message}\``); } catch {}
      console.error("Gemini user-facing failed:", err);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
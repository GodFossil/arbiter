require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");
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

// --- In-memory cache for recent user and channel histories ---
const historyCache = {
  user: new Map(),
  channel: new Map()
};
const HISTORY_TTL_MS = 4000;

// Cached fetch for user's recent messages in a channel
async function fetchUserHistory(userId, channelId, limit = 5) {
  const key = `${userId}:${channelId}:${limit}`;
  const now = Date.now();
  const cached = historyCache.user.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) {
    return cached.data;
  }
  const db = await connect();
  const data = await db.collection("messages")
    .find({ user: userId, channel: channelId })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
  historyCache.user.set(key, { time: now, data });
  return data;
}

// Cached fetch for all recent messages in a channel
async function fetchChannelHistory(channelId, limit = 7) {
  const key = `${channelId}:${limit}`;
  const now = Date.now();
  const cached = historyCache.channel.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) {
    return cached.data;
  }
  const db = await connect();
  const data = await db.collection("messages")
    .find({ channel: channelId, content: { $exists: true } })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
  historyCache.channel.set(key, { time: now, data });
  return data;
}

/** Utility: Gemini Flash Lite prompt for cheap background tasks */
async function geminiFlash(prompt, opts) {
  return await geminiBackground(prompt, { ...opts, modelOverride: "gemini-2.5-flash-lite" });
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== ChannelType.GuildText) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // Store user message in DB (log errors only)
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
    console.warn("DB insert error:", e);
  }

  // --- BACKGROUND FACT CHECK (surface contradiction only) ---
  (async () => {
    let claimSummary = null, exaResults = null, finalFactCheck = null;
    let factCheckVerdict = null;
    try {
      // Stage 1: Summarize claim
      let stage1Prompt = `
Summarize the core factual claim or assertion (if any) in the following user message. 
- Quote or paraphrase only the main claim, in 1 line.
- Respond with just the claim. If there is no explicit claim, respond with "NO CLAIM".
User message:
"${msg.content}"
`.trim();
      let stage1resp = null;
      try {
        stage1resp = await geminiFlash(stage1Prompt);
        if (stage1resp && typeof stage1resp.result === "string") {
          const line = stage1resp.result.replace(/^[\s"`]+|[\s"`]+$/g, "");
          claimSummary = line && line.toUpperCase() !== "NO CLAIM" ? line : null;
        }
      } catch (e) {}

      // Stage 2: Exa search
      let searchQuery = claimSummary || msg.content;
      exaResults = [];
      try {
        exaResults = await exaWebSearch(searchQuery, 5);
      } catch (e) {}

      let context = '';
      if (exaResults && exaResults.length > 0) {
        context = exaResults
          .slice(0, 3)
          .map((r, i) => `Result #${i + 1} | Title: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.text}`)
          .join("\n\n");
      } else {
        context = '';
      }

      // Stage 3: Fact Check (show to user ONLY if contradiction)
      // If context is missing, just log, don't reply
      if (!context || exaResults.length === 0) {
        factCheckVerdict = {
          verdict: "inconclusive",
          explanation: "Insufficient or no relevant web context was found to fact-check this claim.",
          evidence: ""
        };
      } else if (claimSummary) {
        const factCheckPrompt = `
You are an expert, careful, and precise fact-checking assistant.

Instructions:
• Given a [User claim] and [Web context] (search results, may be unrelated or not address the claim).
• If the web context does NOT directly address, support, or contradict the claim, or if context is ambiguous or off-topic, respond ONLY with {"verdict":"inconclusive","explanation":"Insufficient context","evidence":""}
• If the claim IS directly contradicted by a snippet, quote it and explain.
• NEVER guess or assume. Err on the side of "inconclusive" if unsure.

Return your answer as strict JSON ONLY:
{"verdict":"yes"|"no"|"inconclusive","explanation":"...","evidence":"..."}

[User claim]
${JSON.stringify(claimSummary)}

[Web context]
${context}
`.trim();

        try {
          finalFactCheck = await geminiFlash(factCheckPrompt);

          let parsed = null;
          try {
            const jsonMatch = finalFactCheck.result.match(/\{[\s\S]*?\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
          } catch (err) {}

          if (
            !parsed ||
            !parsed.verdict ||
            !["yes", "no", "inconclusive"].includes(parsed.verdict)
          ) {
            factCheckVerdict = {
              verdict: "inconclusive",
              explanation: "No reliable LLM verdict could be retrieved.",
              evidence: ""
            };
          } else {
            factCheckVerdict = parsed;
          }

          // **Only reply if contradiction**
          if (factCheckVerdict.verdict === "yes") {
            try {
              await msg.reply(
                `⚠️ **Contradiction detected:**\n` +
                `**Claim:** ${claimSummary}\n` +
                `**Contradicted by:** ${factCheckVerdict.evidence}\n` +
                `**Explanation:** ${factCheckVerdict.explanation}`
              );
            } catch {}
          }

        } catch (e) {
          // Quietly log
          console.warn("Fact-checker error:", e);
        }
      }
      // Always store all fact checks in DB
      try {
        const db = await connect();
        await db.collection("fact_checks").insertOne({
          msgId: msg.id,
          user: msg.author.id,
          content: msg.content,
          claimSummary,
          exaQuery: searchQuery,
          exaResults,
          geminiPrompt: context ? factCheckVerdict?.geminiPrompt : null,
          geminiResult: finalFactCheck?.result || "",
          geminiVerdict: factCheckVerdict?.verdict || null,
          geminiExplanation: factCheckVerdict?.explanation || null,
          geminiEvidence: factCheckVerdict?.evidence || null,
          checkedAt: new Date()
        });
      } catch(e) {
        console.warn("DB save (fact_checks) error:", e);
      }
    } catch (e) {
      console.warn("Multi-stage fact-check error:", e);
    }

    // Summarization (silently log errors)
    try {
      await geminiFlash(`Summarize: "${msg.content}"\nKeep summarization short, just main point.`);
    } catch (e) {
      console.warn("Summarization error:", e);
    }
  })();

  // --- USER-FACING: ONLY WHEN MENTIONED, REPLIED TO, OR (above) misinfo detected ---
  if (
    msg.mentions.has(client.user) ||
    (msg.reference && msg.reference.messageId) // check for reply
  ) {
    try {
      await msg.channel.sendTyping();

      // Fetch user and channel memory with robust error handling + cache
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
        ? channelHistoryArr.reverse().map(m => {
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
Reply concisely. Use recent context from user, me ("I:"), and others below if relevant. If [news] is present, focus on those results. When describing your past actions, use "I" or "me" instead of "the bot."
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

      // Store bot response in Mongo as a message
      try {
        const db = await connect();
        await db.collection("messages").insertOne({
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
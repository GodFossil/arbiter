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

// Fetch last N user messages in this channel
async function fetchUserHistory(userId, channelId, limit = 5) {
  const db = await connect();
  return await db.collection("messages")
    .find({ user: userId, channel: channelId })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

// Fetch last K channel messages, including bots (with "I:" labeling for bot)
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

// Main handler, now with robust surfaced error handling
client.on("messageCreate", async (msg) => {
  // Discord.js v14+: GuildText is 0, so this is robust:
  if (msg.author.bot || msg.channel.type !== ChannelType.GuildText) return;
  if (CHANNEL_ID_WHITELIST && !CHANNEL_ID_WHITELIST.includes(msg.channel.id)) return;

  // --- STORE USER MESSAGE ---
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
    try {
      await msg.reply(`Failed to save your message to the database: \`${e.message}\``); 
    } catch {}
    console.warn("DB insert error:", e);
  }

  // --- BACKGROUND TASKS (FACT-CHECK, SUMMARIZE) ---
  (async () => {
    // FACT CHECK
    try {
      const exaResults = await exaWebSearch(msg.content, 5);
      let context = '';
      if (exaResults && exaResults.length > 0) {
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
        } catch (e) {
          try { await msg.reply(`Fact-checking failed: \`${e.message}\``); } catch {}
          console.warn("Fact-checker error:", e);
        }
      }
    } catch (e) {
      try { await msg.reply(`Error during background info retrieval: \`${e.message}\``); } catch {}
      console.warn("Background Exa error:", e);
    }
    // SUMMARIZATION
    try {
      await geminiBackground(`Summarize: "${msg.content}"\nKeep summarization short, just main point.`);
    } catch (e) {
      try { await msg.reply(`Summarization failed: \`${e.message}\``); } catch {}
      console.warn("Summarization error:", e);
    }
  })();

  // --- USER-FACING: SMART, CONTEXTUAL, BOT-AWARE ---
  if (msg.mentions.has(client.user)) {
    try {
      await msg.channel.sendTyping();

      // Fetch user and channel memory
      let userHistoryArr = [], channelHistoryArr = [];
      try {
        [userHistoryArr, channelHistoryArr] = await Promise.all([
          fetchUserHistory(msg.author.id, msg.channel.id, 5),
          fetchChannelHistory(msg.channel.id, 7)
        ]);
      } catch (e) {
        try { await msg.reply(`Could not fetch message history: \`${e.message}\``); } catch {}
        throw e; // Don't proceed if memory fetch fails
      }
      // Date for prompt
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

      // Prompt construction
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
      const prompt = `Today is ${dateString}.
Reply concisely. Use recent context from user, me ("I:"), and others below if relevant. If [news] is present, focus on those results. When describing your past actions, use "I" or "me" instead of "the bot."
[user history]\n${userHistory}
[channel context]\n${channelHistory}
${newsSection ? `[news]\n${newsSection}` : ""}
[user message]\n"${msg.content}"
[reply]
`;

      // Generate Gemini response
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
        try { await msg.reply(`Failed to save my reply message: \`${e.message}\``); } catch {}
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

// Login!
client.login(process.env.DISCORD_TOKEN);
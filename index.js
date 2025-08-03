const express = require("express");
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, Events } = require("discord.js");
const { OpenAI } = require("openai");
const mongoose = require("mongoose");

// 🌐 Web server (keeps Render alive)
const app = express();
app.get("/", (_, res) => res.send("Arbiter is online."));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server running."));

// 🔐 Environment
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// 🧠 MongoDB Setup
mongoose.connect(MONGODB_URI);
const memorySchema = new mongoose.Schema({
  userId: String,
  context: Array,
  summary: String,
  preferences: String,
});
const channelMemorySchema = new mongoose.Schema({
  channelId: String,
  messages: Array,
});
const Memory = mongoose.model("Memory", memorySchema);
const ChannelMemory = mongoose.model("ChannelMemory", channelMemorySchema);

async function loadMemory(userId) {
  let doc = await Memory.findOne({ userId });
  if (!doc) {
    doc = new Memory({ userId, context: [], summary: "", preferences: "" });
    await doc.save();
  }
  return doc;
}
async function saveMemory(userId, context, summary, preferences = null) {
  const trimmed = context.slice(-20);
  const update = { context: trimmed };
  if (summary) update.summary = summary;
  if (preferences !== null) update.preferences = preferences;
  await Memory.findOneAndUpdate({ userId }, update, { upsert: true });
}
async function loadChannelMemory(channelId) {
  let doc = await ChannelMemory.findOne({ channelId });
  if (!doc) {
    doc = new ChannelMemory({ channelId, messages: [] });
    await doc.save();
  }
  return doc;
}
async function saveChannelMessage(channelId, messageObj) {
  const doc = await loadChannelMemory(channelId);
  const updated = [...doc.messages, messageObj].slice(-20);
  await ChannelMemory.findOneAndUpdate({ channelId }, { messages: updated });
}

// 🤖 OpenAI Setup
const openai = new OpenAI({ apiKey: OPENAI_KEY });
const AIModel = "gpt-4o";

const AIPrompt = (date, summary, preferences) => `
You are Arbiter, the wise assistant of our Discord debate server: The Debate Server.
You provide logical insights, calm judgment, and philosophical clarity.
You are direct, succinct, humble, and stoic.

Avoid long-winded answers. Be brief. Limit replies to key facts and minimal words.

You must also fact-check claims and point out user contradictions only when they are clear and strong. Be selective.

Today's date is ${date}.
User summary: ${summary || "Unknown."}
User preferences: ${preferences || "None."}
`;

// 🧠 Summarization
async function generateSummary(context) {
  const res = await openai.chat.completions.create({
    model: AIModel,
    messages: [
      { role: "system", content: "Summarize this user's personality, interests, and beliefs based on their recent conversation. Be concise." },
      ...context.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return res.choices[0].message.content;
}

async function detectUserPreferenceRequest(context, input) {
  try {
    const res = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        {
          role: "system",
          content: `
Detect if the user is giving a persistent preference like tone, personality, or behavior instruction.

Only respond with their request (e.g. "be sarcastic", "call me boss").

If no such instruction, reply exactly with "none".
        `,
        },
        ...context.slice(-10),
        { role: "user", content: input },
      ],
      max_tokens: 50,
      temperature: 0,
    });
    const reply = res.choices[0].message.content.trim();
    return reply.toLowerCase() === "none" ? null : reply;
  } catch {
    return null;
  }
}

// 🧠 Strong contradiction/misinformation check
async function detectCorrectionType(userContext, input) {
  const messages = [
    {
      role: "system",
      content: `
You're checking if the new message contains strong contradiction or factual misinformation vs the user's own history.

Respond with:
- "contradiction"
- "misinformation"
- "both"
- "none"

Only say "contradiction" or "misinformation" if the conflict is **clear and significant**.
      `.trim(),
    },
    ...userContext.slice(-15).map((m) => ({ role: "user", content: m.content })),
    { role: "user", content: input },
  ];

  try {
    const res = await openai.chat.completions.create({
      model: AIModel,
      messages,
      max_tokens: 10,
      temperature: 0,
    });
    const ans = res.choices[0].message.content.toLowerCase();
    if (ans.includes("both")) return "both";
    if (ans.includes("contradiction")) return "contradiction";
    if (ans.includes("misinformation")) return "misinformation";
    return "none";
  } catch {
    return "none";
  }
}

// 🔁 Secondary verification
async function confirmCorrection(correctionType, context, input) {
  if (correctionType === "none") return false;
  const clarificationPrompt = `You previously marked this message as ${correctionType}. Please confirm: Is the conflict truly strong and meaningful? Reply with "yes" or "no".`;
  const res = await openai.chat.completions.create({
    model: AIModel,
    messages: [
      { role: "system", content: clarificationPrompt },
      ...context.slice(-10).map((m) => ({ role: "user", content: m.content })),
      { role: "user", content: input },
    ],
    max_tokens: 5,
    temperature: 0,
  });
  return res.choices[0].message.content.toLowerCase().includes("yes");
}

// 🤖 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const mentioned = message.mentions.has(client.user);
  const isReply = message.reference;
  const input = message.content.trim();
  const userId = message.author.id;
  const channelId = message.channel.id;

  const userDoc = await loadMemory(userId);
  const channelDoc = await loadChannelMemory(channelId);
  const userContext = [...userDoc.context, { role: "user", content: input }];
  const channelContext = channelDoc.messages.map((msg) => ({
    role: "user",
    content: `${msg.username}: ${msg.content}`,
  }));
  const summary = userDoc.summary;
  const preferences = userDoc.preferences;

  await saveChannelMessage(channelId, {
    username: message.author.username,
    content: input,
  });

  const newPref = await detectUserPreferenceRequest(userContext, input);
  const updatedPreferences = newPref || preferences;

  let correctionType = await detectCorrectionType(userContext, input);
  const confirmed = await confirmCorrection(correctionType, userContext, input);
  if (!confirmed) correctionType = "none";

  const shouldRespond = mentioned || isReply || correctionType !== "none";
  if (!shouldRespond && !newPref) return;

  await message.channel.sendTyping();

  const displayName = message.member?.displayName || message.author.username;
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  let header = "";
  if (!mentioned && !isReply) {
    if (correctionType === "contradiction") header = "📌 *Contradiction noted:*\n\n";
    if (correctionType === "misinformation") header = "📚 *Factual correction:*\n\n";
    if (correctionType === "both") header = "⚠️ *Contradiction & factual error:*\n\n";
  }

  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        { role: "system", content: AIPrompt(currentDate, summary, updatedPreferences) },
        ...channelContext.slice(-10),
        ...userContext.slice(-10),
      ],
    });

    const reply = response.choices[0].message.content.trim();
    await message.reply(`${displayName},\n\n${header}${reply}`);

    const updatedContext = [...userContext, { role: "assistant", content: reply }];
    let updatedSummary = summary;
    if (updatedContext.length % 10 === 0) {
      updatedSummary = await generateSummary(updatedContext.slice(-20));
    }

    await saveMemory(userId, updatedContext, updatedSummary, updatedPreferences);
  } catch (err) {
    console.error("AI ERROR:", err);
    message.reply("Something went wrong.");
  }
});

client.on("ready", () => {
  console.log(`🟢 Arbiter online as ${client.user.tag}`);
});
client.login(DISCORD_TOKEN);
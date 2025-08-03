const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
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

Today's date is ${date}.
User summary: ${summary || "Unknown."}
User preferences: ${preferences || "None."}
`;

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

  const isMentioned = message.mentions.users.has(client.user.id);
  const isRepliedTo = !!message.reference;
  if (!isMentioned && !isRepliedTo) return;

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

  await message.channel.sendTyping();

  const displayName = message.member?.displayName || message.author.username;
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

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
    await message.reply(`${displayName},\n\n${reply}`);

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
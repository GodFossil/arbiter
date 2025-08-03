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
});
const channelMemorySchema = new mongoose.Schema({
  channelId: String,
  messages: Array,
});

const Memory = mongoose.model("Memory", memorySchema);
const ChannelMemory = mongoose.model("ChannelMemory", channelMemorySchema);

// 🔄 User memory functions
async function loadMemory(userId) {
  let doc = await Memory.findOne({ userId });
  if (!doc) {
    doc = new Memory({ userId, context: [], summary: "" });
    await doc.save();
  }
  return doc;
}

async function saveMemory(userId, context, summary) {
  const trimmed = context.slice(-20);
  await Memory.findOneAndUpdate(
    { userId },
    { context: trimmed, ...(summary && { summary }) },
    { upsert: true }
  );
}

// 🔄 Channel memory functions
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

// 📘 System Instruction
const AIPrompt = (date, summary) => `
You are Arbiter, the wise assistant of our Discord debate server: The Debate Server. 
You provide logical insights, calm judgment, and philosophical clarity.
You are direct, succinct, humble, and stoic.

You must also fact-check any claims and respectfully correct misinformation or logical contradictions.
If something sounds false or contradicts an earlier statement by the same user, point it out gently but clearly.

Always prioritize clarity and truth. Brevity is wisdom.

Today's date is ${date}.
Here is what you know about this user: ${summary || "You do not yet know much about this user."}
`;

// 🧠 Summarize a user's memory context
async function generateSummary(context) {
  const response = await openai.chat.completions.create({
    model: AIModel,
    messages: [
      {
        role: "system",
        content:
          "Summarize this user's personality, interests, and beliefs based on their recent conversation history. Be concise and informative.",
      },
      ...context.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return response.choices[0].message.content;
}

// ❓ Detect if user contradicted themselves
async function needsFactCheck(userContext, input) {
  try {
    const prompt = `
You're an assistant checking whether a user has contradicted themselves or introduced factual misinformation compared to their recent messages.

Check ONLY against this specific user's previous statements. Ignore what others have said.

Respond with "yes" if the new message contains misinformation or contradicts something they said before. Otherwise, respond with "no".

Previous messages:
${userContext.map((m) => m.content).join("\n")}

New message:
${input}
    `;

    const check = await openai.chat.completions.create({
      model: AIModel,
      messages: [{ role: "system", content: prompt }],
      max_tokens: 5,
      temperature: 0,
    });

    const answer = check.choices[0].message.content.toLowerCase();
    return answer.includes("yes");
  } catch (err) {
    console.error("Fact-check error:", err);
    return false;
  }
}

// 🤖 Discord Bot
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

  // Save message to shared channel memory
  await saveChannelMessage(channelId, {
    username: message.author.username,
    content: input,
  });

  const shouldRespond =
    mentioned ||
    isReply ||
    (await needsFactCheck(userContext, input));

  if (!shouldRespond) return;

  await message.channel.sendTyping();

  const displayName = message.member?.displayName || message.author.username;
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    const combinedContext = [
      { role: "system", content: AIPrompt(currentDate, summary) },
      ...channelContext.slice(-10),
      ...userContext.slice(-10),
    ];

    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: combinedContext,
    });

    const reply = response.choices[0].message.content;
    await message.reply(`${displayName}, ${reply}`);

    const updatedUserContext = [...userContext, { role: "assistant", content: reply }];
    let updatedSummary = summary;

    if (updatedUserContext.length % 10 === 0) {
      updatedSummary = await generateSummary(updatedUserContext.slice(-20));
    }

    await saveMemory(userId, updatedUserContext, updatedSummary);
  } catch (err) {
    console.error("AI ERROR:", err);
    message.reply("Something went wrong.");
  }
});

client.on("ready", () => {
  console.log(`🟢 Arbiter online as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
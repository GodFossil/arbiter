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

// 🧠 MongoDB Setup (no deprecated options)
mongoose.connect(MONGODB_URI);

const memorySchema = new mongoose.Schema({
  userId: String,
  context: Array,
});
const Memory = mongoose.model("Memory", memorySchema);

async function loadMemory(userId) {
  let doc = await Memory.findOne({ userId });
  if (!doc) {
    doc = new Memory({ userId, context: [] });
    await doc.save();
  }
  return doc.context;
}

async function saveMemory(userId, context) {
  const trimmed = context.slice(-20); // ⏳ Limit memory to last 20 messages
  await Memory.findOneAndUpdate({ userId }, { context: trimmed }, { upsert: true });
}

// 🤖 OpenAI Setup
const openai = new OpenAI({ apiKey: OPENAI_KEY });
const AIModel = "gpt-o4-mini-2025-04-16";

// 🧠 Core system instruction (with fact-checking and dynamic date)
const AIPrompt = () => `
You are Arbiter, the wise assistant of our Discord debate server: The Debate Server. 
You provide logical insights, calm judgment, and philosophical clarity.
You are direct, succinct, humble, and stoic.

You must also fact-check any claims and respectfully correct misinformation or logical contradictions.
If something sounds false or contradicts an earlier statement, point it out gently but clearly.

Always prioritize clarity and truth. Brevity is wisdom.

The current date is ${new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
})}.
`;

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
  if (!(mentioned || isReply)) return;

  const displayName = message.member?.displayName || message.author.username;
  const input = message.content.trim();

  await message.channel.sendTyping();

  const context = await loadMemory(message.author.id);
  context.push({ role: "user", content: input });

  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        { role: "system", content: AIPrompt() },
        ...context.slice(-20),
      ],
    });

    const reply = response.choices[0].message.content;
    await message.reply(`${displayName}, ${reply}`);

    context.push({ role: "assistant", content: reply });
    await saveMemory(message.author.id, context);
  } catch (err) {
    console.error("AI ERROR:", err);
    message.reply("Something went wrong.");
  }
});

client.on("ready", () => {
  console.log(`🟢 Arbiter online as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
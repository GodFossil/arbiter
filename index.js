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
const Memory = mongoose.model("Memory", memorySchema);

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

// 🤖 OpenAI Setup
const openai = new OpenAI({ apiKey: OPENAI_KEY });
const AIModel = "gpt-4o";

// 📘 System Instruction
const AIPrompt = (date, summary) => `
You are Arbiter, the wise assistant of our Discord debate server: The Debate Server. 
You provide logical insights, calm judgment, and philosophical clarity.
You are direct, succinct, humble, and stoic.

You must also fact-check any claims and respectfully correct misinformation or logical contradictions.
If something sounds false or contradicts an earlier statement, point it out gently but clearly.

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

// ❓ Detect if message needs fact check or contradiction response — ONLY based on this user's prior statements
async function needsFactCheck(context, input) {
  try {
    const prompt = `
You are an assistant checking a user's latest message for factual errors or contradictions against their own recent conversation history. 
Ignore messages from other users or external conversations.

Answer ONLY with "yes" if the latest message contains misinformation or contradicts something the user said before. Otherwise answer "no".

User conversation history:
${context.map(m => m.content).join("\n")}

Latest message:
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
  const doc = await loadMemory(message.author.id);
  const context = [...doc.context, { role: "user", content: input }];
  const summary = doc.summary;

  const shouldRespond =
    mentioned ||
    isReply ||
    (await needsFactCheck(context, input));

  if (!shouldRespond) return;

  await message.channel.sendTyping();

  const displayName = message.member?.displayName || message.author.username;
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        { role: "system", content: AIPrompt(currentDate, summary) },
        ...context.slice(-20),
      ],
    });

    const reply = response.choices[0].message.content;
    await message.reply(`${displayName}, ${reply}`);

    const updatedContext = [...context, { role: "assistant", content: reply }];
    let updatedSummary = summary;

    if (updatedContext.length % 10 === 0) {
      updatedSummary = await generateSummary(updatedContext.slice(-20));
    }

    await saveMemory(message.author.id, updatedContext, updatedSummary);
  } catch (err) {
    console.error("AI ERROR:", err);
    message.reply("Something went wrong.");
  }
});

client.on("ready", () => {
  console.log(`🟢 Arbiter online as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
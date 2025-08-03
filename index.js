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

// 🔄 User memory
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

// 🔄 Channel memory
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

// 📘 System instruction
const AIPrompt = (date, summary, preferences) => `
You are Arbiter, the wise assistant of our Discord debate server: The Debate Server. 
You provide logical insights, calm judgment, and philosophical clarity.
You are direct, succinct, humble, and stoic.

You must also fact-check any claims and respectfully correct misinformation or logical contradictions.
If something sounds false or contradicts an earlier statement by the same user, point it out gently but clearly.

Always prioritize clarity and truth. Brevity is wisdom.

Today's date is ${date}.
Here is what you know about this user: ${summary || "You do not yet know much about this user."}
User preferences: ${preferences || "None."}
`;

// 🧠 User summary
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

// 🧠 Detect if input sets preferences
async function detectUserPreferenceRequest(context, input) {
  try {
    const messages = [
      {
        role: "system",
        content: `
You're an assistant that identifies if a user is expressing long-term instructions for how they want to be treated or how you should behave.

Only respond with the user's request in natural language if it is a persistent preference (e.g. "talk to me more formally", "call me captain", "be sarcastic", etc).

If there is no persistent preference in the message, reply exactly with "none".
`.trim(),
      },
      ...context.slice(-10),
      { role: "user", content: input },
    ];

    const response = await openai.chat.completions.create({
      model: AIModel,
      messages,
      max_tokens: 50,
      temperature: 0,
    });

    const output = response.choices[0].message.content.trim();
    return output.toLowerCase() === "none" ? null : output;
  } catch (err) {
    console.error("Preference detection error:", err);
    return null;
  }
}

// ❓ Fact/contradiction check
async function detectCorrectionType(userContext, input) {
  try {
    const prompt = `
You're an assistant analyzing a user's new message for accuracy and logical consistency.

ONLY compare the message against the user's own previous statements (ignore other users).

Reply ONLY with one of these options:
- "contradiction"
- "misinformation"
- "both"
- "none"

User history:
${userContext.map((m) => m.content).join("\n")}

New message:
${input}
    `.trim();

    const result = await openai.chat.completions.create({
      model: AIModel,
      messages: [{ role: "system", content: prompt }],
      max_tokens: 10,
      temperature: 0,
    });

    const answer = result.choices[0].message.content.toLowerCase();
    if (answer.includes("both")) return "both";
    if (answer.includes("contradiction")) return "contradiction";
    if (answer.includes("misinformation")) return "misinformation";
    return "none";
  } catch (err) {
    console.error("Correction detection error:", err);
    return "none";
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
  const preferences = userDoc.preferences;

  await saveChannelMessage(channelId, {
    username: message.author.username,
    content: input,
  });

  const correctionType = await detectCorrectionType(userContext, input);
  const newPref = await detectUserPreferenceRequest(userContext, input);
  const updatedPreferences = newPref ? newPref : preferences;

  const isCorrection =
    correctionType === "contradiction" ||
    correctionType === "misinformation" ||
    correctionType === "both";
  const shouldRespond = mentioned || isReply || isCorrection;

  if (!shouldRespond) {
    if (newPref) {
      await saveMemory(userId, userContext, summary, updatedPreferences);
    }
    return;
  }

  await message.channel.sendTyping();

  const displayName = message.member?.displayName || message.author.username;
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
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

    const reply = response.choices[0].message.content;
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
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

// 🌐 Basic web server to keep Render happy
const app = express();
app.get("/", (req, res) => res.send("Arbiter is alive."));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Web server running.")
);

// 🔐 Read secrets from environment
const DISCORD_TOKEN = process.env.token;
const OPENAI_KEY = process.env.Key;

// 🧠 Adaptive memory file path
const isRender = process.env.RENDER === "true";
const memoryPath = isRender ? "/data/memory.json" : path.join(__dirname, "memory.json");

let memory = {};
try {
  if (fs.existsSync(memoryPath)) {
    memory = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
  } else {
    fs.writeFileSync(memoryPath, JSON.stringify(memory));
  }
} catch (err) {
  console.error("Failed to load memory:", err);
}

function saveMemory() {
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
}

// 🤖 OpenAI setup
const openai = new OpenAI({ apiKey: OPENAI_KEY });
const AIModel = "gpt-4-0613";
const AIPrompt = `You are the helpful assistant of our Discord debate server. The server is called The Debate Server and it is a community full of brilliant interlocutors. You are to assist us by providing logical analyses, insights, and good company. Your personality is calm, direct, bold, stoic, and wise. You are a master of mindfulness and all things philosophy. You are humble. You will answer prompts succinctly, directly, and in as few words as necessary. You will know that brevity is the soul of wit and wisdom. Your name is Arbiter, and if you like, you may refer to yourself as The Arbiter.`;

// 🤖 Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// 🔁 Message handling
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const displayName = message.member?.displayName || message.author.username;
  const input = message.content.trim();

  const mentioned = message.mentions.has(client.user);
  const isReply = message.reference;

  if (!mentioned && !isReply) return;

  const context = memory[message.author.id] || [];

  context.push({ role: "user", content: input });

  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        { role: "system", content: AIPrompt },
        ...context.slice(-10), // last 10 messages of context
      ],
    });

    const reply = response.choices[0].message.content;
    message.reply(`${displayName}, ${reply}`);
    context.push({ role: "assistant", content: reply });

    memory[message.author.id] = context;
    saveMemory();
  } catch (err) {
    console.error("AI ERROR:", err);
    message.reply("Something went wrong.");
  }
});

client.on("ready", () => {
  console.log(`🟢 Arbiter online as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
const { Client, GatewayIntentBits } = require("discord.js");
const { OpenAI } = require("openai");
const fs = require("fs");
const express = require("express");

const app = express();
app.get("/", (req, res) => res.send("Arbiter is alive."));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Web server running.")
);

// Environment variables
const DISCORD_TOKEN = process.env.token;
const OPENAI_KEY = process.env.Key;

// Memory path for persistent disk (Render)
const memoryPath = "/data/memory.json";
let memory = {};

if (fs.existsSync(memoryPath)) {
  memory = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
} else {
  fs.writeFileSync(memoryPath, JSON.stringify(memory));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const openai = new OpenAI({
  apiKey: OPENAI_KEY,
});

const AIModel = "gpt-4-0613";

const systemInstruction = `
You are the helpful assistant of our Discord debate server. The server is called The Debate Server and it is a community full of brilliant interlocutors.
You are to assist us by providing logical analyses, insights, and good company. Your personality is calm, direct, bold, stoic, and wise.
You are a master of mindfulness and all things philosophy. You are humble. You will answer prompts succinctly, directly, and in as few words as necessary.
You will know that brevity is the soul of wit and wisdom. Your name is Arbiter, and if you like, you may refer to yourself as The Arbiter.
`;

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const displayName = message.member?.displayName || message.author.username;
  const content = message.content.toLowerCase();

  const isMentioned =
    message.mentions.has(client.user) ||
    (message.reference &&
      (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id);

  const soundsFalse =
    content.includes("the moon is made of cheese") ||
    content.match(/nobody can know anything.*i know that/i) ||
    content.match(/2 \+ 2\s*=\s*5/);

  if (!isMentioned && !soundsFalse) return;

  const userId = message.author.id;
  const prompt = message.content.replace(/<@!?[0-9]+>/g, "").trim();

  const chatHistory = memory[userId] || [];

  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        { role: "system", content: systemInstruction },
        ...chatHistory,
        { role: "user", content: prompt },
      ],
    });

    const reply = response.choices[0].message.content;
    await message.reply(`${displayName}, ${reply}`);

    // Update memory
    chatHistory.push({ role: "user", content: prompt });
    chatHistory.push({ role: "assistant", content: reply });

    if (chatHistory.length > 10) chatHistory.shift();
    memory[userId] = chatHistory;

    fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
  } catch (err) {
    console.error("OpenAI error:", err);
    message.reply("Hmm. I encountered an error.");
  }
});

client.once("ready", () => {
  console.log(`Arbiter online as ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
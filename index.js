const OpenAI = require("openai");
const fs = require("fs");
const config = require("./config.json");

const openai = new OpenAI({
  apiKey: config.Key,
});

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const AIPrompt = `
You are the helpful assistant of our Discord debate server. The server is called The Debate Server and it is a community full of brilliant interlocutors. You are to assist us by providing logical analyses, insights, and good company. Your personality is calm, direct, bold, stoic, and wise. You are a master of mindfulness and all things philosophy. You are humble. You will answer prompts succinctly, directly, and in as few words as necessary. You will know that brevity is the soul of wit and wisdom. Your name is Arbiter, and if you like, you may refer to yourself as The Arbiter.
`;

const AIModel = "gpt-4-0613";

const messageHistories = new Map();
const MAX_HISTORY = 10;

let memory = {};
const memoryPath = "./memory.json";

try {
  memory = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
} catch (e) {
  console.error("Failed to load memory, starting fresh.");
  memory = {};
}

// 🔍 Fact-check/contradiction evaluator
async function evaluateForCorrection(messageContent) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You're a truth-checking assistant. Your job is to determine whether a message contains factual inaccuracies or internal contradictions. If it does, explain briefly and directly. If it's clear, reply only with 'clear'.",
        },
        {
          role: "user",
          content: messageContent,
        },
      ],
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("Fact check error:", err.message);
    return "clear";
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const isReplyToArbiter =
    message.reference &&
    (await message.channel.messages.fetch(message.reference.messageId))
      ?.author.id === client.user.id;

  let allowResponse = isMentioned || isReplyToArbiter;

  if (!allowResponse) {
    const check = await evaluateForCorrection(message.content);
    if (check !== "clear") {
      message.reply(`🧠 Correction:\n${check}`);
      return; // Don't proceed to full AI reply — only correction
    } else {
      return; // Stay silent
    }
  }

  const prompt = message.content;
  const channelId = message.channel.id;
  const userId = message.author.id;

  if (!messageHistories.has(channelId)) {
    messageHistories.set(channelId, []);
  }

  const history = messageHistories.get(channelId);
  history.push({ role: "user", content: prompt });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  const username =
    message.member?.displayName || message.author.username;

  if (!memory[userId]) {
    memory[userId] = {
      name: username,
      notes: [],
    };
  } else {
    memory[userId].name = username;
  }

  memory[userId].notes.push(prompt);
  if (memory[userId].notes.length > 50) {
    memory[userId].notes.shift();
  }

  const userMemory = memory[userId].notes.join("\n");

  const systemPrompt = `
${AIPrompt.trim()}

You are currently speaking with a user named ${username}.
Here is what Arbiter remembers about this user:
${userMemory}
`;

  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        {
          role: "system",
          content: systemPrompt.trim(),
        },
        ...history,
      ],
    });

    const reply = response.choices[0].message.content;
    message.reply(reply);

    history.push({ role: "assistant", content: reply });
    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.error("OpenAI API error:", error);
    message.reply("API ERROR: " + error.message);
  }
});

client.on("ready", () => {
  console.log(`🟢 Arbiter online as: ${client.user.tag}`);
});

client.login(config.token);
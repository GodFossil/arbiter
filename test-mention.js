require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
    Partials.ThreadMember
  ]
});

client.once("ready", () => {
  console.log(`Test bot logged in as ${client.user.tag}!`);
  console.log(`Bot ID: ${client.user.id}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  
  console.log(`[TEST] Received message: "${msg.content}" from ${msg.author.username}`);
  
  const isMentioned = msg.mentions.has(client.user);
  console.log(`[TEST] Bot mentioned: ${isMentioned}`);
  
  if (isMentioned) {
    console.log(`[TEST] Bot was mentioned! Sending test reply...`);
    try {
      await msg.reply("🤖 Test: I can see mentions!");
    } catch (e) {
      console.error(`[TEST] Failed to reply:`, e);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

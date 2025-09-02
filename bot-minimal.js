// Minimal Discord bot test
console.log("MINIMAL BOT: Starting...");

const { Client, GatewayIntentBits } = require("discord.js");

// Create a simple client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Add event listeners
client.on('ready', () => {
  console.log("MINIMAL BOT: Ready event fired!");
  console.log("Bot logged in as:", client.user.tag);
  console.log("Guilds:", client.guilds.cache.size);
});

client.on('debug', info => console.log('DEBUG:', info));
client.on('warn', warn => console.log('WARN:', warn));
client.on('error', error => console.log('ERROR:', error));

client.on('messageCreate', (msg) => {
  if (msg.content === '!ping') {
    msg.reply('Pong!');
  }
});

// Login
console.log("MINIMAL BOT: Attempting login...");
console.log("Token exists:", !!process.env.DISCORD_TOKEN);
console.log("Token length:", process.env.DISCORD_TOKEN?.length);

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log("MINIMAL BOT: Login successful!");
  })
  .catch(error => {
    console.error("MINIMAL BOT: Login failed:", error);
    process.exit(1);
  });

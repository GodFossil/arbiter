// Minimal Discord bot test
console.log("MINIMAL BOT: Starting...");

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const axios = require("axios");

// Add simple HTTP server to satisfy Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Minimal Bot - OK'));
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

// Test network connectivity to Discord
async function testDiscordConnectivity() {
  console.log("CONNECTIVITY: Testing Discord API access...");
  try {
    // Test Discord REST API
    const response = await axios.get('https://discord.com/api/v10/gateway', {
      timeout: 10000
    });
    console.log("CONNECTIVITY: Discord API accessible:", response.data);
    
    // Test if we can resolve Discord's gateway
    const gatewayResponse = await axios.get('https://discord.com/api/v10/gateway/bot', {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
      },
      timeout: 10000
    });
    console.log("CONNECTIVITY: Discord Gateway Bot info:", gatewayResponse.data);
    
  } catch (error) {
    console.error("CONNECTIVITY: Failed to reach Discord API:", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
  }
}

// Test connectivity before attempting Discord login
testDiscordConnectivity();

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

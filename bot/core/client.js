const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require('../../config');

/**
 * Create and configure Discord client with all necessary intents
 * @returns {Client} Configured Discord client
 */
function createDiscordClient() {
  console.log("[DEBUG] Creating Discord client with intents...");
  
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
      Partials.User,
      Partials.ThreadMember
    ]
  });
  
  console.log("[DEBUG] Discord client created successfully");
  return client;
}

/**
 * Check if bot should be active in the given channel
 * @param {Message} msg - Discord message object
 * @returns {boolean} True if bot should be active
 */
function isBotActiveInChannel(msg) {
  const ALLOWED_CHANNELS = config.server.allowedChannels
    ? config.server.allowedChannels.split(',').map(s => s.trim()).filter(Boolean)
    : [];
    
  const parentId = msg.channel.parentId;
  if (ALLOWED_CHANNELS.length === 0) return true;
  if (ALLOWED_CHANNELS.includes(msg.channel.id)) return true;
  if (parentId && ALLOWED_CHANNELS.includes(parentId)) return true;
  return false;
}

module.exports = {
  createDiscordClient,
  isBotActiveInChannel
};

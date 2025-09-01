const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require('../../config');
const logger = require('../../logger');

/**
 * Create and configure Discord client with all necessary intents
 * @returns {Client} Configured Discord client
 */
function createDiscordClient() {
  // logger.debug("Creating Discord client with intents"); // Temporarily commented out
  
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
  
  // logger.debug("Discord client created successfully"); // Temporarily commented out
  return client;
}

/**
 * Check if bot should be active in the given channel
 * @param {Message} msg - Discord message object
 * @returns {boolean} True if bot should be active
 */
function isBotActiveInChannel(msg) {
  try {
    const ALLOWED_CHANNELS = config.server.allowedChannels
      ? config.server.allowedChannels.split(',').map(s => s.trim()).filter(Boolean)
      : [];
      
    const parentId = msg.channel.parentId;
    if (ALLOWED_CHANNELS.length === 0) return true;
    if (ALLOWED_CHANNELS.includes(msg.channel.id)) return true;
    if (parentId && ALLOWED_CHANNELS.includes(parentId)) return true;
    return false;
  } catch (error) {
    console.warn('Error in isBotActiveInChannel, defaulting to active:', error.message);
    return true; // Default to allowing bot activity if config fails
  }
}

module.exports = {
  createDiscordClient,
  isBotActiveInChannel
};

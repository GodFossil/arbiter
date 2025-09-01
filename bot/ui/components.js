const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const config = require('../../config');

// ---- SOURCE BUTTON MANAGEMENT ----
let latestSourcesByBotMsg = new Map(); // msgId -> { urls, timestamp }
const MAX_SOURCE_MAPPINGS = config.cache.maxSourceMappings;
const SOURCE_BUTTON_ID = "arbiter-show-sources";

/**
 * Create a sources button component for Discord messages
 * @param {string[]} sourceArray - Array of source URLs
 * @param {string} msgId - Unique message identifier for button mapping
 * @returns {ActionRowBuilder} Discord action row with sources button
 */
function makeSourcesButton(sourceArray, msgId) {
  return new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setCustomId(`${SOURCE_BUTTON_ID}:${msgId}`)
      .setLabel('\u{1D48A}')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!sourceArray || sourceArray.length === 0)
  ]);
}

/**
 * Create a jump button component for Discord messages
 * @param {string} jumpUrl - URL to jump to in Discord
 * @returns {ActionRowBuilder} Discord action row with jump button
 */
function makeJumpButton(jumpUrl) {
  return new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setURL(jumpUrl)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔗')
  ]);
}

/**
 * Reply to a message with sources button functionality
 * @param {Message} msg - Discord message to reply to
 * @param {object} replyOptions - Discord reply options
 * @param {string[]} sources - Array of source URLs
 * @param {Map} sourceMap - Optional source mapping (for backwards compatibility)
 * @returns {Message} The reply message object
 */
async function replyWithSourcesButton(msg, replyOptions, sources, sourceMap = null) {
  // Generate a unique ID for this button interaction
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  
  const replyMsg = await msg.reply({
    ...replyOptions,
    components: [makeSourcesButton(sources, uniqueId)]
  });
  
  // Map both the unique ID and the Discord message ID to the sources
  const targetMap = sourceMap || latestSourcesByBotMsg;
  targetMap.set(uniqueId, { urls: sources, timestamp: Date.now() });
  targetMap.set(replyMsg.id, { urls: sources, timestamp: Date.now() });
  
  return replyMsg;
}

/**
 * Handle source button interactions
 * @param {Interaction} interaction - Discord button interaction
 */
async function handleSourceButtonInteraction(interaction) {
  const buttonId = interaction.customId.split(':')[1];
  let sources = latestSourcesByBotMsg.get(buttonId) || latestSourcesByBotMsg.get(interaction.message.id);

  if (!sources) {
    await interaction.reply({ 
      content: "No source information found for this message.", 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  if (!sources.urls || !sources.urls.length) {
    await interaction.reply({ 
      content: "No URLs were referenced in this response.", 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  const resp = `**Sources referenced:**\n` + sources.urls.map(u => `<${u}>`).join('\n');
  await interaction.reply({ 
    content: resp, 
    flags: MessageFlags.Ephemeral 
  });
}

/**
 * Clean up expired source mappings and disable their buttons
 * @param {Client} client - Discord client instance
 */
async function cleanupSourceMappings(client) {
  const cutoff = Date.now() - 3600 * 1000; // 1 hour cutoff
  const expiredEntries = [];
  
  // Find expired entries
  for (const [id, obj] of latestSourcesByBotMsg.entries()) {
    if (obj.timestamp < cutoff) {
      expiredEntries.push(id);
    }
  }
  
  // Disable buttons for expired Discord message IDs
  for (const id of expiredEntries) {
    // Discord message IDs are snowflakes (17-19 digits), our unique IDs contain dashes
    if (/^\d{17,19}$/.test(id)) {
      try {
        // Try to find the message across all cached channels
        let foundMessage = null;
        for (const [_, channel] of client.channels.cache) {
          if (channel.messages) {
            try {
              foundMessage = await channel.messages.fetch(id);
              if (foundMessage) break;
            } catch (e) {
              continue;
            }
          }
        }
        
        if (foundMessage && foundMessage.components && foundMessage.components.length > 0) {
          // Remove the button completely by setting components to empty array
          await foundMessage.edit({ components: [] });
        }
      } catch (e) {
        const { ui } = require('../../logger');
        ui.warn("Failed to disable button for message", { messageId: id, error: e.message });
      }
    }
    
    // Remove from map regardless of button disable success
    latestSourcesByBotMsg.delete(id);
  }

  // Enforce size limit on source mappings to prevent memory leaks
  if (latestSourcesByBotMsg.size > MAX_SOURCE_MAPPINGS) {
    const { ui } = require('../../logger');
    ui.debug("Source mappings cache too large - removing oldest entries", {
      currentSize: latestSourcesByBotMsg.size,
      maxSize: MAX_SOURCE_MAPPINGS,
      removingCount: Math.floor(MAX_SOURCE_MAPPINGS * 0.2)
    });
    const entries = Array.from(latestSourcesByBotMsg.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by timestamp
    const toRemove = Math.floor(MAX_SOURCE_MAPPINGS * 0.2); // Remove 20% of entries
    for (let i = 0; i < toRemove; i++) {
      latestSourcesByBotMsg.delete(entries[i][0]);
    }
  }
}

/**
 * Clear all source mappings (used during admin reset)
 */
function clearSourceMappings() {
  latestSourcesByBotMsg.clear();
}

/**
 * Get current source mappings size for status reporting
 * @returns {number} Number of source mappings
 */
function getSourceMappingsSize() {
  return latestSourcesByBotMsg.size;
}

/**
 * Store source mapping for button interactions
 * @param {string} id - Unique identifier for the mapping
 * @param {string[]} sources - Array of source URLs
 */
function storeSourceMapping(id, sources) {
  latestSourcesByBotMsg.set(id, { urls: sources, timestamp: Date.now() });
}

module.exports = {
  makeSourcesButton,
  makeJumpButton,
  replyWithSourcesButton,
  handleSourceButtonInteraction,
  cleanupSourceMappings,
  clearSourceMappings,
  getSourceMappingsSize,
  storeSourceMapping,
  SOURCE_BUTTON_ID
};

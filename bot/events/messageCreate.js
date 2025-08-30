const { ChannelType } = require("discord.js");
const { isBotActiveInChannel } = require("../core/client");
const { handleAdminCommands } = require("../commands/admin");
const { processBackgroundDetection } = require("../handlers/detection");
const { handleUserFacingReply } = require("../handlers/userReply");
const { saveUserMessage } = require("../../storage");
const { aiSummarization } = require("../../ai");

/**
 * Handle Discord messageCreate events
 * @param {Message} msg - Discord message object
 * @param {Client} client - Discord client instance
 * @param {object} state - Bot state object
 */
async function handleMessageCreate(msg, client, state) {
  // ---- BASIC FILTERING ----
  if (msg.author.bot) return;
  if (msg.channel.type !== ChannelType.GuildText) return;
  if (!isBotActiveInChannel(msg)) return;

  console.log(`[MESSAGE] Processing message from ${msg.author.username}: "${msg.content}"`);

  // ---- ADMIN COMMANDS ----
  const adminHandled = await handleAdminCommands(msg, state);
  if (adminHandled) return;

  // ---- MENTION/REPLY DETECTION ----
  const isMentioned = msg.mentions.has(client.user);
  let isReplyToBot = false;
  let repliedToMsg = null;

  if (msg.reference?.messageId) {
    try {
      repliedToMsg = await msg.channel.messages.fetch(msg.reference.messageId);
      if (repliedToMsg?.author?.id === client.user.id) {
        isReplyToBot = true;
        console.log(`[DEBUG] User replied to bot message`);
      }
    } catch (e) {
      console.warn("Failed to fetch replied-to message:", e);
    }
  }

  // ---- SAVE MESSAGE TO STORAGE ----
  let thisMsgId = null;
  try {
    thisMsgId = await saveUserMessage(msg, aiSummarization, state.SYSTEM_INSTRUCTIONS);
    console.log(`[DEBUG] Message saved with ID: ${thisMsgId}`);
  } catch (e) {
    console.warn("Failed to save message:", e);
  }

  // ---- BACKGROUND DETECTION ----
  const isUserFacingTrigger = isMentioned || isReplyToBot;
  const detectionResults = await processBackgroundDetection(msg, state, isUserFacingTrigger);

  // ---- USER-FACING REPLIES ----
  if (isUserFacingTrigger) {
    await handleUserFacingReply(msg, client, state, detectionResults);
  }
}

module.exports = {
  handleMessageCreate
};

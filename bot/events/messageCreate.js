const { ChannelType } = require("discord.js");
const { isBotActiveInChannel } = require("../core/client");
const { handleAdminCommands } = require("../commands/admin");
const { processBackgroundDetection } = require("../handlers/detection");
const { handleUserFacingReply } = require("../handlers/userReply");
const { saveUserMessage } = require("../../storage");
const { aiSummarization } = require("../../ai");
const { generateCorrelationId, logHelpers } = require("../../logger");

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

  // Generate correlation ID and create logger
  const correlationId = generateCorrelationId();
  const logger = logHelpers.messageStart(correlationId, msg);
  
  logger.info("Processing message", { content: msg.content.slice(0, 100) });

  // ---- ADMIN COMMANDS ----
  const adminHandled = await handleAdminCommands(msg, state, logger);
  if (adminHandled) {
    logger.info("Admin command handled");
    return;
  }

  // ---- MENTION/REPLY DETECTION ----
  const isMentioned = msg.mentions.has(client.user);
  let isReplyToBot = false;
  let repliedToMsg = null;

  if (msg.reference?.messageId) {
    try {
      repliedToMsg = await msg.channel.messages.fetch(msg.reference.messageId);
      if (repliedToMsg?.author?.id === client.user.id) {
        isReplyToBot = true;
        logger.debug("User replied to bot message", { repliedMessageId: repliedToMsg.id });
      }
    } catch (e) {
      logger.warn("Failed to fetch replied-to message", { error: e.message });
    }
  }

  // ---- SAVE MESSAGE TO STORAGE ----
  let thisMsgId = null;
  try {
    const timer = logHelpers.dbOperation(logger, 'saveUserMessage', 'messages');
    thisMsgId = await saveUserMessage(msg, aiSummarization, state.SYSTEM_INSTRUCTIONS);
    timer.end({ savedMessageId: thisMsgId });
  } catch (e) {
    logger.warn("Failed to save message", { error: e.message });
  }

  // ---- BACKGROUND DETECTION ----
  const isUserFacingTrigger = isMentioned || isReplyToBot;
  const detectionResults = await processBackgroundDetection(msg, state, isUserFacingTrigger, logger);

  // ---- USER-FACING REPLIES ----
  if (isUserFacingTrigger) {
    logger.info("Handling user-facing reply", { isMentioned, isReplyToBot });
    await handleUserFacingReply(msg, client, state, detectionResults, logger);
  }
  
  logger.debug("Message processing completed");
}

module.exports = {
  handleMessageCreate
};

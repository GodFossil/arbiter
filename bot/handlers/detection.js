const { detectContradictionOrMisinformation } = require("../../detection");
const { isTrivialOrSafeMessage, isOtherBotCommand } = require("../../filters");
const { replyWithSourcesButton } = require("../ui/components");
const { truncateMessage } = require("../ui/formatting");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require('../../config');

const MAX_FACTCHECK_CHARS = config.detection.maxFactcheckChars;
const SOURCE_BUTTON_ID = "arbiter-show-sources";

/**
 * Process background detection for contradictions and misinformation
 * @param {Message} msg - Discord message object
 * @param {object} state - Bot state with detection settings
 * @param {boolean} isUserFacingTrigger - Whether this is triggered by mention/reply
 * @param {object} logger - Structured logger with correlation context
 * @returns {object|null} Detection results or null if no detection
 */
async function processBackgroundDetection(msg, state, isUserFacingTrigger = false, logger = null) {
  // Use fallback logger if none provided
  const log = logger || require('../../logger').detection;
  
  log.debug("Background detection check", { 
    detectionEnabled: state.DETECTION_ENABLED,
    isUserFacingTrigger 
  });
  
  if (!state.DETECTION_ENABLED) {
    log.debug("Detection disabled globally - skipping background detection");
    return null;
  }

  // Intelligent pre-filtering to avoid unnecessary API calls
  const shouldRunDetection = msg.content.length <= MAX_FACTCHECK_CHARS && 
    !isTrivialOrSafeMessage(msg.content) && 
    !isOtherBotCommand(msg.content) &&
    msg.content.length > 8; // Minimum substantive length
  
  if (!shouldRunDetection) {
    log.debug("Message filtered out - not running detection", {
      contentLength: msg.content.length,
      maxLength: MAX_FACTCHECK_CHARS,
      isTrivial: isTrivialOrSafeMessage(msg.content),
      isBotCommand: isOtherBotCommand(msg.content)
    });
    return null;
  }

  log.info("Running background detection", { 
    contentPreview: msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '')
  });
  
  try {
    const timer = require('../../logger').logHelpers.detectionAnalysis(log, msg.content);
    const detectionResults = await detectContradictionOrMisinformation(msg, state.LOGICAL_PRINCIPLES_ENABLED);
    timer.end({
      hasContradiction: detectionResults?.contradiction?.contradiction === "yes",
      hasMisinformation: detectionResults?.misinformation?.misinformation === "yes"
    });
    
    // Only send immediate detection alerts if user is NOT mentioning/replying to bot
    log.debug("Detection analysis completed", {
      isUserFacingTrigger,
      willSendAlert: !isUserFacingTrigger,
      hasResults: !!detectionResults
    });
    
    if (detectionResults && !isUserFacingTrigger) {
      await sendDetectionAlerts(msg, detectionResults, log);
    }
    
    return detectionResults;
    
  } catch (e) {
    log.warn("Detection failure (silent to user)", { error: e.message });
    return null;
  }
}

/**
 * Send detection alerts to Discord based on detection results
 * @param {Message} msg - Discord message object  
 * @param {object} detectionResults - Results from detection service
 * @param {object} logger - Structured logger with correlation context
 */
async function sendDetectionAlerts(msg, detectionResults, logger = null) {
  const log = logger || require('../../logger').detection;
  const hasContradiction = detectionResults.contradiction && detectionResults.contradiction.contradiction === "yes";
  const hasMisinformation = detectionResults.misinformation && detectionResults.misinformation.misinformation === "yes";
  
  if (!hasContradiction && !hasMisinformation) return;

  // Handle combined detection or individual detection
  if (hasContradiction && hasMisinformation) {
    await sendCombinedDetectionAlert(msg, detectionResults);
  } else if (hasContradiction) {
    await sendContradictionAlert(msg, detectionResults.contradiction);
  } else if (hasMisinformation) {
    await sendMisinformationAlert(msg, detectionResults.misinformation);
  }
}

/**
 * Send combined contradiction and misinformation alert
 */
async function sendCombinedDetectionAlert(msg, detectionResults) {
  const combinedReply = 
    `⚡🚩 **CONTRADICTION & MISINFORMATION DETECTED** 🚩⚡\n\n` +
    `**CONTRADICTION FOUND:**\n` +
    `-# \`\`\`${detectionResults.contradiction.evidence}\`\`\`\n` +
    `-# \`\`\`${detectionResults.contradiction.contradicting || msg.content}\`\`\`\n` +
    `${detectionResults.contradiction.reason}\n\n` +
    `**MISINFORMATION FOUND:**\n` +
    `**False claim:** ${msg.content}\n` +
    `**Why false:** ${detectionResults.misinformation.reason}\n` +
    (detectionResults.misinformation.evidence ? `**Fact-check evidence:** ${detectionResults.misinformation.evidence}` : "");
  
  const evidenceUrl = detectionResults.contradiction.url || "";
  const misinfoUrl = detectionResults.misinformation.url || "";
  const allSources = [misinfoUrl].filter(Boolean);
  
  if (evidenceUrl && allSources.length > 0) {
    // Both jump button and sources button  
    const combinedId = `${Date.now()}-combined`;
    const combinedButtonRow = new ActionRowBuilder().addComponents([
      new ButtonBuilder()
        .setURL(evidenceUrl)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🔗'),
      new ButtonBuilder()
        .setCustomId(`${SOURCE_BUTTON_ID}:${combinedId}`)
        .setLabel('\u{1D48A}')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
    ]);
    
    const replyMsg = await msg.reply({
      content: truncateMessage(combinedReply),
      components: [combinedButtonRow]
    });
    
    // Store sources for button interaction
    // Note: This would ideally be handled through dependency injection
    const components = require("../ui/components");
    components.storeSourceMapping(combinedId, allSources);
    components.storeSourceMapping(replyMsg.id, allSources);
  } else if (evidenceUrl) {
    // Just jump button
    const { makeJumpButton } = require("../ui/components");
    await msg.reply({
      content: truncateMessage(combinedReply),
      components: [makeJumpButton(evidenceUrl)]
    });
  } else if (allSources.length > 0) {
    // Just sources button
    await replyWithSourcesButton(msg, { content: truncateMessage(combinedReply) }, allSources);
  } else {
    // No buttons
    await msg.reply(truncateMessage(combinedReply));
  }
}

/**
 * Send contradiction alert
 */
async function sendContradictionAlert(msg, contradictionResult) {
  const contradictionReply = 
    `⚡ **CONTRADICTION DETECTED** ⚡️\n\n` +
    `-# \`\`\`${contradictionResult.evidence}\`\`\`\n` +
    `-# \`\`\`${contradictionResult.contradicting || msg.content}\`\`\`\n\n` +
    `${contradictionResult.reason}`;
  
  const evidenceUrl = contradictionResult.url || "";
  
  if (evidenceUrl) {
    const { makeJumpButton } = require("../ui/components");
    await msg.reply({
      content: truncateMessage(contradictionReply),
      components: [makeJumpButton(evidenceUrl)]
    });
  } else {
    await msg.reply(truncateMessage(contradictionReply));
  }
}

/**
 * Send misinformation alert
 */
async function sendMisinformationAlert(msg, misinformationResult) {
  const misinfoReply = 
    `🚩 **MISINFORMATION DETECTED** 🚩\n` +
    `Reason: ${misinformationResult.reason}\n` +
    (misinformationResult.evidence ? `Evidence: ${misinformationResult.evidence}` : "");
  
  const sourcesForButton = misinformationResult.url ? [misinformationResult.url] : [];
  
  if (sourcesForButton.length > 0) {
    await replyWithSourcesButton(msg, { content: truncateMessage(misinfoReply) }, sourcesForButton);
  } else {
    await msg.reply(truncateMessage(misinfoReply));
  }
}

module.exports = {
  processBackgroundDetection,
  sendDetectionAlerts,
  sendCombinedDetectionAlert,
  sendContradictionAlert,
  sendMisinformationAlert
};

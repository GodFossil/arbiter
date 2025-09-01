const { fetchUserHistory, fetchChannelHistory, saveBotReply } = require("../../storage");
const { isTrivialOrSafeMessage } = require("../../filters");
const { replyWithSourcesButton } = require("../ui/components");
const { truncateMessage, getDisplayName } = require("../ui/formatting");
const { aiUserFacing } = require("../../ai");
const { exaSearch, exaAnswer, cleanUrl } = require("../../ai-utils");
const { getLogicalContext } = require("../../logic");
const { secureUserContent } = require("../../prompt-security");

/**
 * Generate and send user-facing reply when bot is mentioned or replied to
 * @param {Message} msg - Discord message object
 * @param {Client} client - Discord client instance
 * @param {object} state - Bot state with detection settings
 * @param {object} detectionResults - Optional detection results to include
 * @param {object} logger - Structured logger with correlation context
 */
async function handleUserFacingReply(msg, client, state, detectionResults = null, logger = null) {
  // Use fallback logger if none provided
  const log = logger || require('../../logger').createCorrelatedLogger(
    require('../../logger').generateCorrelationId(),
    { userId: msg.author.id, component: 'userReply' }
  );
  
  log.info("Bot mentioned or replied to - processing reply");
  
  try {
    await msg.channel.sendTyping();
    log.debug("Typing indicator sent");
    
    // Save current message first
    const thisMsgId = await saveCurrentMessage(msg, state.SYSTEM_INSTRUCTIONS);
    log.debug("Current message saved", { messageId: thisMsgId });
    
    // Fetch conversation context
    const context = await fetchConversationContext(msg, client, thisMsgId, log);
    if (!context) {
      log.warn("Insufficient message history for reply");
      try {
        await msg.reply("Not enough message history available for a quality reply. Truth sleeps.");
      } catch (error) {
        log.warn("Failed to send insufficient history message", { error: error.message });
      }
      return;
    }
    
    // Check if conversation is mostly trivial
    if (isConversationTrivial(context)) {
      try {
        await msg.reply("Little of substance has been spoken here so far.");
      } catch (error) {
        log.warn("Failed to send trivial conversation message", { error: error.message });
      }
      return;
    }
    
    // Generate news section if relevant
    const newsData = await generateNewsSection(msg.content);
    
    // Build AI prompt
    const prompt = buildUserReplyPrompt(msg, context, newsData, detectionResults, state, client);
    
    // Generate AI response
    const timer = require('../../logger').logHelpers.aiRequest(log, 'user-facing', prompt);
    const { result, modelUsed } = await aiUserFacing(prompt);
    timer.end({ 
      modelUsed,
      responseLength: result.length
    });
    
    // ==== Source-gathering logic for non-news answers ====
    let allSources = [...(newsData.sources || [])];
    if (allSources.length === 0) {
      try {
        log.debug("No news sources found, trying exaAnswer for general sources");
        const exaRes = await exaAnswer(msg.content);
        if (exaRes && exaRes.urls && exaRes.urls.length) {
          allSources = exaRes.urls;
          log.info("Found sources via exaAnswer", { sourceCount: allSources.length });
        }
      } catch (e) {
        log.warn("exaAnswer failed", { error: e.message });
      }
    }
    
    // Prepare final reply with detection integration
    const finalReply = integrateDetectionIntoReply(result, detectionResults, state);
    
    // Add detection sources if available
    if (detectionResults && state.DETECTION_ENABLED) {
      if (detectionResults.misinformation && detectionResults.misinformation.url) {
        allSources.push(detectionResults.misinformation.url);
      }
    }
    
    // Filter and clean sources
    const filteredSources = [...new Set(allSources
      .map(u => cleanUrl(u))
      .filter(u => typeof u === "string" && u.startsWith("http")))];
    
    log.debug("Sources prepared for reply", { 
      sourceCount: filteredSources.length,
      sources: filteredSources.slice(0, 3) // Log first 3 for debugging
    });
    
    // Send reply with appropriate buttons
    if (filteredSources.length > 0) {
      await replyWithSourcesButton(msg, { content: truncateMessage(finalReply) }, filteredSources);
    } else {
      await msg.reply(truncateMessage(finalReply));
    }
    
    // Save bot reply to storage
    await saveBotReply(msg, finalReply, client.user);
    
  } catch (err) {
    log.error("User-facing reply failed", { 
      error: err.message,
      stack: err.stack
    });
    try {
      await msg.reply("Nobody will help you.");
    } catch (error) {
      log.error("Failed to send error fallback message", { error: error.message });
    }
  }
}

/**
 * Fetch conversation context (user and channel history)
 */
async function fetchConversationContext(msg, client, thisMsgId = null, logger = null) {
  
  // Use fallback logger if none provided
  const log = logger || require('../../logger').createCorrelatedLogger(
    require('../../logger').generateCorrelationId(),
    { userId: msg.author.id, component: 'fetchContext' }
  );
  
  log.debug("Fetching user history");
  let userHistoryArr = null;
  try {
    userHistoryArr = await fetchUserHistory(
      msg.author.id, msg.channel.id, msg.guildId, 10, thisMsgId
    );
    log.debug("User history fetched", { messageCount: userHistoryArr?.length || 0 });
  } catch (e) {
    log.error("User history fetch failed", { error: e.message });
    userHistoryArr = null;
    try { 
      await msg.reply("The past refuses to reveal itself."); 
      return null; 
    } catch (error) {
      log.warn("Failed to send user history fetch error message", { error: error.message });
    }
  }
  
  log.debug("Fetching channel history");
  let channelHistoryArr = null;
  try {
    channelHistoryArr = await fetchChannelHistory(
      msg.channel.id, msg.guildId, 15, thisMsgId
    );
    log.debug("Channel history fetched", { messageCount: channelHistoryArr?.length || 0 });
  } catch (e) {
    log.error("Channel history fetch failed", { error: e.message });
    channelHistoryArr = null;
    try { 
      await msg.reply("All context is lost to the ether."); 
      return null; 
    } catch (error) {
      log.warn("Failed to send channel history fetch error message", { error: error.message });
    }
  }
  
  if (!userHistoryArr || !channelHistoryArr) {
    return null;
  }
  
  return { userHistoryArr, channelHistoryArr };
}

/**
 * Check if conversation is mostly trivial content
 */
function isConversationTrivial(context) {
  const allHistContent = [
    ...context.userHistoryArr.map(m => m.content),
    ...context.channelHistoryArr.map(m => m.content)
  ];
  const trivialCount = allHistContent.filter(isTrivialOrSafeMessage).length;
  const totalCount = allHistContent.length;
  
  return totalCount > 0 && (trivialCount / totalCount) > 0.8;
}

/**
 * Generate news section if message requests current events
 */
async function generateNewsSection(content) {
  let newsSection = "";
  let sources = [];
  
  try {
    const newsRegex = /\b(news|headline|latest|article|current event|today)\b/i;
    if (newsRegex.test(content)) {
      let topic = "world events";
      
      // Extract topic from content
      const topicRegex = /\b(?:news|latest|headlines?)\s+(?:about|on|regarding|for)?\s+([a-zA-Z\s]+?)(?:\s|$|[.!?])/i;
      const topicMatch = content.match(topicRegex);
      if (topicMatch) {
        topic = topicMatch[1].trim();
      }
      
      // Use temporary logger for news section
      const { exa } = require('../../logger');
      exa.info("Searching for news", { topic });
      const newsResults = await exaSearch(`latest news ${topic} today`, 3);
      
      if (newsResults && newsResults.length > 0) {
        newsSection = `\n\n**📰 Latest News (${topic}):**\n` +
          newsResults.map((item, i) => `${i + 1}. **${item.title}** - ${item.text || 'No summary available'}`).join('\n');
        sources = newsResults.map(item => item.url).filter(Boolean);
        exa.info("News results found", { resultCount: newsResults.length });
      }
    }
  } catch (e) {
    const { exa } = require('../../logger');
    exa.warn("News generation failed", { error: e.message });
  }
  
  return { newsSection, sources };
}

/**
 * Build the AI prompt for user-facing replies
 */
function buildUserReplyPrompt(msg, context, newsData, detectionResults, state, client) {
  const botName = () => Math.random() < 0.33 ? "Arbiter" : (Math.random() < 0.5 ? "The Arbiter" : "Arbiter");
  
  const userHistory = context.userHistoryArr.map(m => `You: ${m.content}`).reverse().join("\n");
  const channelHistory = context.channelHistoryArr.map(m => {
    if (m.type === "summary") return `[SUMMARY] ${m.summary}`;
    if (m.user === msg.author.id) return `${m.displayName || m.username}: ${m.content}`;
    if (m.user === client.user.id) return `${botName()}: ${m.content}`;
    return `${m.displayName || m.username || "User"}: ${m.content}`;
  }).join("\n");
  
  const dateString = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const logicalContext = state.LOGICAL_PRINCIPLES_ENABLED ? getLogicalContext() : "";
  
  return `
${logicalContext}

You are responding to a message in The Debate Server Discord community on ${dateString}.

**User's Recent Messages (${getDisplayName(msg)}):**
${userHistory || "No recent messages available"}

**Channel Conversation History:**
${channelHistory || "No conversation history available"}

${secureUserContent(msg.content, { label: 'Current User Message' })}
${newsData.newsSection}

${detectionResults ? buildDetectionContext(detectionResults) : ""}

Respond as Arbiter. Be direct, factual, and helpful while maintaining your stoic personality.
`.trim();
}

/**
 * Build detection context for AI prompt
 */
function buildDetectionContext(detectionResults) {
  let detectionContext = "";
  
  if (detectionResults.contradiction && detectionResults.contradiction.contradiction === "yes") {
    detectionContext += `\n**DETECTED CONTRADICTION:** This user contradicted themselves. Previous statement: "${detectionResults.contradiction.evidence}" vs current: "${detectionResults.contradiction.contradicting}". Reason: ${detectionResults.contradiction.reason}`;
  }
  
  if (detectionResults.misinformation && detectionResults.misinformation.misinformation === "yes") {
    detectionContext += `\n**DETECTED MISINFORMATION:** False information detected. Reason: ${detectionResults.misinformation.reason}. Evidence: ${detectionResults.misinformation.evidence || "See fact-check sources"}`;
  }
  
  return detectionContext;
}

/**
 * Integrate detection results into AI-generated reply (matches original behavior)
 */
function integrateDetectionIntoReply(aiReply, detectionResults, state) {
  if (!detectionResults || !state.DETECTION_ENABLED) {
    return aiReply;
  }
  
  const hasContradiction = detectionResults.contradiction && detectionResults.contradiction.contradiction === "yes";
  const hasMisinformation = detectionResults.misinformation && detectionResults.misinformation.misinformation === "yes";
  
  if (!hasContradiction && !hasMisinformation) {
    return aiReply;
  }
  
  // This log statement will be handled by the calling function's logger
  
  let detectionSection = "\n\n---\n";
  
  if (hasContradiction && hasMisinformation) {
    detectionSection += `⚡🚩 **CONTRADICTION & MISINFORMATION DETECTED** 🚩⚡\n\n`;
    detectionSection += `**CONTRADICTION:** ${detectionResults.contradiction.reason}\n`;
    detectionSection += `**MISINFORMATION:** ${detectionResults.misinformation.reason}`;
  } else if (hasContradiction) {
    detectionSection += `⚡ **CONTRADICTION DETECTED** ⚡\n`;
    detectionSection += `${detectionResults.contradiction.reason}`;
  } else if (hasMisinformation) {
    detectionSection += `🚩 **MISINFORMATION DETECTED** 🚩\n`;
    detectionSection += `${detectionResults.misinformation.reason}`;
  }
  
  return aiReply + detectionSection;
}

/**
 * Save current message to storage and return its ID
 */
async function saveCurrentMessage(msg, systemInstructions = "") {
  try {
    const { saveUserMessage } = require("../../storage");
    const { aiSummarization } = require("../../ai");
    const insertedId = await saveUserMessage(msg, aiSummarization, systemInstructions);
    return insertedId?.toString() || null;
  } catch (e) {
    // Use basic logger for save failures
    const { storage } = require('../../logger');
    storage.warn("Failed to save current message", { error: e.message });
    return null;
  }
}

module.exports = {
  handleUserFacingReply,
  fetchConversationContext,
  buildUserReplyPrompt,
  integrateDetectionIntoReply
};

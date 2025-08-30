const { fetchUserHistory, fetchChannelHistory, saveBotReply } = require("../../storage");
const { isTrivialOrSafeMessage } = require("../../filters");
const { replyWithSourcesButton } = require("../ui/components");
const { truncateMessage, getDisplayName } = require("../ui/formatting");
const { aiUserFacing } = require("../../ai");
const { exaSearch, exaAnswer, cleanUrl } = require("../../ai-utils");
const { getLogicalContext } = require("../../logic");

/**
 * Generate and send user-facing reply when bot is mentioned or replied to
 * @param {Message} msg - Discord message object
 * @param {Client} client - Discord client instance
 * @param {object} state - Bot state with detection settings
 * @param {object} detectionResults - Optional detection results to include
 */
async function handleUserFacingReply(msg, client, state, detectionResults = null) {
  console.log(`[DEBUG] Bot mentioned or replied to. Processing reply...`);
  
  try {
    await msg.channel.sendTyping();
    console.log(`[DEBUG] Typing indicator sent`);
    
    // Save current message first
    const thisMsgId = await saveCurrentMessage(msg, state.SYSTEM_INSTRUCTIONS);
    
    // Fetch conversation context
    const context = await fetchConversationContext(msg, client, thisMsgId);
    if (!context) {
      try {
      await msg.reply("Not enough message history available for a quality reply. Truth sleeps.");
    } catch {}
      return;
    }
    
    // Check if conversation is mostly trivial
    if (isConversationTrivial(context)) {
      try {
        await msg.reply("Little of substance has been spoken here so far.");
      } catch {}
      return;
    }
    
    // Generate news section if relevant
    const newsData = await generateNewsSection(msg.content);
    
    // Build AI prompt
    const prompt = buildUserReplyPrompt(msg, context, newsData, detectionResults, state, client);
    
    // Generate AI response
    const { result, modelUsed } = await aiUserFacing(prompt);
    console.log(`[AI] User-facing reply generated using ${modelUsed}`);
    
    // ==== Source-gathering logic for non-news answers ====
    let allSources = [...(newsData.sources || [])];
    if (allSources.length === 0) {
      try {
        console.log(`[DEBUG] No news sources found, trying exaAnswer for general sources`);
        const exaRes = await exaAnswer(msg.content);
        if (exaRes && exaRes.urls && exaRes.urls.length) {
          allSources = exaRes.urls;
          console.log(`[DEBUG] Found ${allSources.length} sources via exaAnswer`);
        }
      } catch (e) {
        console.warn("[DEBUG] exaAnswer failed:", e.message);
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
    
    console.log('[DEBUG] filteredSources:', filteredSources);
    
    // Send reply with appropriate buttons
    if (filteredSources.length > 0) {
      await replyWithSourcesButton(msg, { content: truncateMessage(finalReply) }, filteredSources);
    } else {
      await msg.reply(truncateMessage(finalReply));
    }
    
    // Save bot reply to storage
    await saveBotReply(msg, finalReply, client.user);
    
  } catch (err) {
    try {
      await msg.reply("Nobody will help you.");
    } catch {}
    console.error("AI user-facing failed:", err);
  }
}

/**
 * Fetch conversation context (user and channel history)
 */
async function fetchConversationContext(msg, client, thisMsgId = null) {
  
  console.log(`[DEBUG] Fetching user history...`);
  let userHistoryArr = null;
  try {
    userHistoryArr = await fetchUserHistory(
      msg.author.id, msg.channel.id, msg.guildId, 10, thisMsgId
    );
    console.log(`[DEBUG] User history fetched: ${userHistoryArr?.length || 0} messages`);
  } catch (e) {
    console.error(`[DEBUG] User history fetch failed:`, e);
    userHistoryArr = null;
    try { 
      await msg.reply("The past refuses to reveal itself."); 
      return null; 
    } catch {}
  }
  
  console.log(`[DEBUG] Fetching channel history...`);
  let channelHistoryArr = null;
  try {
    channelHistoryArr = await fetchChannelHistory(
      msg.channel.id, msg.guildId, 15, thisMsgId
    );
    console.log(`[DEBUG] Channel history fetched: ${channelHistoryArr?.length || 0} messages`);
  } catch (e) {
    console.error(`[DEBUG] Channel history fetch failed:`, e);
    channelHistoryArr = null;
    try { 
      await msg.reply("All context is lost to the ether."); 
      return null; 
    } catch {}
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
      
      console.log(`[NEWS] Searching for news about: ${topic}`);
      const newsResults = await exaSearch(`latest news ${topic} today`, 3);
      
      if (newsResults && newsResults.length > 0) {
        newsSection = `\n\n**📰 Latest News (${topic}):**\n` +
          newsResults.map((item, i) => `${i + 1}. **${item.title}** - ${item.text || 'No summary available'}`).join('\n');
        sources = newsResults.map(item => item.url).filter(Boolean);
      }
    }
  } catch (e) {
    console.warn("News generation failed:", e);
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

**Current User Message:** "${msg.content}"
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
  
  console.log(`[DEBUG] Combining detection results with user-facing reply`);
  
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
    console.warn("Failed to save current message:", e);
    return null;
  }
}

module.exports = {
  handleUserFacingReply,
  fetchConversationContext,
  buildUserReplyPrompt,
  integrateDetectionIntoReply
};

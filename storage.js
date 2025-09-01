const { connect, resetDatabase } = require("./mongo");
const { isTrivialOrSafeMessage } = require("./filters");
const config = require('./config');
const { storage: logger } = require('./logger');

// ---- LRU CACHE IMPLEMENTATION ----
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  
  get(key) {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return null;
  }
  
  set(key, value) {
    if (this.cache.has(key)) {
      // Update existing key
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  delete(key) {
    return this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  get size() {
    return this.cache.size;
  }
  
  // Add a message to the appropriate cache entries
  addMessage(msg) {
    const userKey = `user:${msg.user}:${msg.channel}:${msg.guildId}`;
    const channelKey = `channel:${msg.channel}:${msg.guildId}`;
    
    // Get existing arrays or create new ones
    let userMessages = this.get(userKey) || [];
    let channelMessages = this.get(channelKey) || [];
    
    // Add new message to front (most recent)
    userMessages.unshift(msg);
    channelMessages.unshift(msg);
    
    // Keep only the most recent N messages
    userMessages = userMessages.slice(0, 20); // Keep 20 user messages
    channelMessages = channelMessages.slice(0, 50); // Keep 50 channel messages
    
    // Update cache
    this.set(userKey, userMessages);
    this.set(channelKey, channelMessages);
  }
}

// ---- CACHE INSTANCES ----
const messageCache = new LRUCache(config.cache.maxMessageCacheSize); // Cache up to configured number of query results
const contentAnalysisCache = new Map(); // Cache content analysis results
const contradictionValidationCache = new Map(); // Cache validation results

// ---- STORAGE CONFIGURATION ----
const ANALYSIS_CACHE_TTL_MS = config.cache.analysisCacheTtlMs; // TTL for analysis cache
const MAX_CONTEXT_MESSAGES_PER_CHANNEL = config.storage.maxContextMessagesPerChannel;
const SUMMARY_BLOCK_SIZE = config.storage.summaryBlockSize;
const TRIVIAL_HISTORY_THRESHOLD = config.storage.trivialHistoryThreshold; // threshold for trivial messages
const MAX_ANALYSIS_CACHE_SIZE = config.cache.maxAnalysisCacheSize; // Prevent memory leaks

// ---- UTILITY FUNCTIONS ----
function getDisplayName(msg) {
  if (!msg.guild) return msg.author.username;
  const member = msg.guild.members.cache.get(msg.author.id) || msg.member;
  if (member && member.displayName) return member.displayName;
  return msg.author.username;
}

function getChannelName(msg) {
  try { return msg.channel.name || `id:${msg.channel.id}`; } catch { return `id:${msg.channel.id}`; }
}

function getGuildName(msg) {
  try { return msg.guild?.name || `id:${msg.guildId || "?"}`; } catch { return `id:${msg.guildId || "?"}`; }
}

async function getDisplayNameById(userId, guild) {
  if (!guild) return userId;
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName || member.user.username || userId;
  } catch {
    return userId;
  }
}



// ---- HISTORY UTILS WITH LRU CACHE ----
async function fetchUserHistory(userId, channelId, guildId, limit = 7, excludeMsgId = null) {
  const cacheKey = `user:${userId}:${channelId}:${guildId}`;
  
  // Try cache first
  let cachedMessages = messageCache.get(cacheKey) || [];
  
  // Filter out excluded message if specified
  if (excludeMsgId) {
    cachedMessages = cachedMessages.filter(m => m._id?.toString() !== excludeMsgId);
  }
  
  // If we have enough cached messages, return them
  if (cachedMessages.length >= limit) {
    logger.debug("User history cache hit", { 
      userId, 
      cachedCount: cachedMessages.length 
    });
    return cachedMessages.slice(0, limit);
  }
  
  // Cache miss or insufficient data - fetch from MongoDB
  logger.debug("User history cache miss - fetching from MongoDB", { userId });
  const db = await connect();
  const query = { type: "message", user: userId, channel: channelId, guildId };
  if (excludeMsgId) query._id = { $ne: excludeMsgId };
  
  const data = await db.collection("messages")
    .find(query)
    .sort({ ts: -1 })
    .limit(Math.max(limit, 20)) // Fetch extra for better caching
    .toArray();
  
  // Update cache with fresh data
  messageCache.set(cacheKey, data);
  
  return data.slice(0, limit);
}

async function fetchChannelHistory(channelId, guildId, limit = 7, excludeMsgId = null) {
  const cacheKey = `channel:${channelId}:${guildId}`;
  
  // Try cache first
  let cachedMessages = messageCache.get(cacheKey) || [];
  
  // Filter out excluded message if specified
  if (excludeMsgId) {
    cachedMessages = cachedMessages.filter(m => m._id?.toString() !== excludeMsgId);
  }
  
  // If we have enough cached messages, return them
  if (cachedMessages.length >= limit) {
    console.log(`[CACHE HIT] Channel history for ${channelId} (${cachedMessages.length} cached messages)`);
    return cachedMessages.slice(0, limit);
  }
  
  // Cache miss or insufficient data - fetch from MongoDB
  console.log(`[CACHE MISS] Channel history for ${channelId} - fetching from MongoDB`);
  const db = await connect();
  
  const [full, summaries] = await Promise.all([
    db.collection("messages")
      .find({ type: "message", channel: channelId, guildId, content: { $exists: true }, ...(excludeMsgId && { _id: { $ne: excludeMsgId } }) })
      .sort({ ts: -1 })
      .limit(Math.max(limit, 50)) // Fetch extra for better caching
      .toArray(),
    db.collection("messages")
      .find({ type: "summary", channel: channelId, guildId })
      .sort({ ts: -1 })
      .limit(3)
      .toArray()
  ]);
  
  const result = [...summaries.reverse(), ...full.reverse()];
  
  // Update cache with fresh data (messages only, not summaries for simplicity)
  messageCache.set(cacheKey, full);
  
  return result.slice(0, limit + summaries.length);
}

// ---- FETCH USER MESSAGES FOR DETECTION ----
async function fetchUserMessagesForDetection(userId, channelId, guildId, excludeMessageId, limit = 50) {
  const db = await connect();
  return await db.collection("messages")
    .find({
      type: "message",
      user: userId,
      channel: channelId,
      guildId: guildId,
      discordMessageId: { $ne: excludeMessageId }
    })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

// ---- MEMORY SAVE WITH META ----
async function saveUserMessage(msg, aiSummarization = null, SYSTEM_INSTRUCTIONS = "") {
  const db = await connect();
  const doc = {
    type: "message",
    user: msg.author.id,
    username: msg.author.username,
    displayName: getDisplayName(msg),
    channel: msg.channel.id,
    channelName: getChannelName(msg),
    guildId: msg.guildId || (msg.guild && msg.guild.id) || null,
    guildName: getGuildName(msg),
    isBot: msg.author.bot,
    content: msg.content,
    discordMessageId: msg.id,
    ts: new Date(),
  };
  const res = await db.collection("messages").insertOne(doc);
  
  // Update LRU cache with new message
  messageCache.addMessage(doc);
  
  const count = await db.collection("messages").countDocuments({
    type: "message",
    channel: msg.channel.id,
    guildId: doc.guildId
  });
  if (count > MAX_CONTEXT_MESSAGES_PER_CHANNEL) {
    const toSummarize = await db.collection("messages")
      .find({ type: "message", channel: msg.channel.id, guildId: doc.guildId })
      .sort({ ts: 1 })
      .limit(SUMMARY_BLOCK_SIZE)
      .toArray();

    // Trivial message filtering for summarization batch
    const hasSubstantive = toSummarize.some(m => !isTrivialOrSafeMessage(m.content));
    const trivialPercent = toSummarize.filter(m => isTrivialOrSafeMessage(m.content)).length / toSummarize.length;
    // Use a count-based threshold, e.g. only summarize if at least 30% are substantive
    if (toSummarize.length > 0 && hasSubstantive && trivialPercent <= TRIVIAL_HISTORY_THRESHOLD) {
      let userDisplayNames = {};
      if (msg.guild) {
        const uniqueUserIds = [...new Set(toSummarize.map(m => m.user))];
        await Promise.all(uniqueUserIds.map(
          async uid => userDisplayNames[uid] = await getDisplayNameById(uid, msg.guild)
        ));
      }
      const summaryPrompt = `
${SYSTEM_INSTRUCTIONS}
Summarize the following Discord channel messages as a brief log for posterity. Use users' display names when possible.
- If messages include false claims, contradictions, or retractions, state explicitly who was mistaken, who corrected them (and how), and what exactly was the error.
- If a user admits an error, highlight this. We commend integrity.
- If a debate remains unresolved or inconclusive by the end of this block, note it is unresolved, but do not imply equivalence as if both sides are equally supported when they are not.
- Do not soften, balance, or average disagreements where the superior argument is clear. Be direct: flag unsubstantiated claims, debunked assertions, consequential logical fallacies, dishonesty, unwarranted hostility, failures to concede, dodgy tactics, and corrections. Commend outstanding arguments and displays of intellectual honesty.
- If you detect jokes, sarcasm, or unserious messages, do not treat them as genuine arguments or factual claims. Mention them only to clarify tone, provide context, or explain a lack of stance. Use your best judgement.
- Avoid unnecessary ambiguity in summary sentences. Assert clearly when a user's claim is unsupported or proven incorrect, and do not use hedging ("may", "might", "possibly") unless there is genuine ambiguity.
- Whatever the case, do NOT sugar coat your observations. Call things for what they are. Let _truth over everything_ be your primordial tenet.
- You must begin your output with 'Summary:' and use this bullet-point style for every summary:  
  • [display name]: [summary sentence]
- Be specific. If in doubt, prioritize clarity over brevity.
Messages:
${toSummarize.map(m => `[${new Date(m.ts).toLocaleString()}] ${userDisplayNames[m.user] || m.username}: ${m.content}`).join("\n")}
Summary:
`.trim();
      let summary = "";
      try {
        if (aiSummarization && typeof aiSummarization === 'function') {
          const { result } = await aiSummarization(summaryPrompt);
          summary = result;
        } else {
          summary = "[summarization function not provided]";
        }
      } catch (e) {
        summary = "[failed to summarize]";
        logger.warn("Summary error", { error: e.message });
      }
      await db.collection("messages").insertOne({
        type: "summary",
        channel: msg.channel.id,
        channelName: getChannelName(msg),
        guildId: doc.guildId,
        guildName: doc.guildName,
        startTs: toSummarize[0].ts,
        endTs: toSummarize[toSummarize.length - 1].ts,
        users: Object.values(userDisplayNames),
        summary,
        ts: new Date(),
      });
      await db.collection("messages").deleteMany({
        _id: { $in: toSummarize.map(m => m._id) }
      });
    } // End IF substantive
  }
  return res.insertedId;
}

// ---- SAVE BOT REPLY ----
async function saveBotReply(msg, content, clientUser) {
  try {
    const db = await connect();
    await db.collection("messages").insertOne({
      type: "message",
      user: clientUser.id,
      username: clientUser.username || "Arbiter",
      displayName: "Arbiter",
      channel: msg.channel.id,
      channelName: getChannelName(msg),
      guildId: msg.guildId,
      guildName: getGuildName(msg),
      isBot: true,
      content: content,
      ts: new Date(),
    });
  } catch (e) {
    logger.warn("DB insert error (bot reply)", { error: e.message });
  }
}

// ---- CACHE MANAGEMENT UTILITIES ----
function clearAllCaches() {
  messageCache.clear();
  contentAnalysisCache.clear();
  contradictionValidationCache.clear();
}

function getCacheStatus() {
  return {
    messageCache: messageCache.size,
    contentAnalysisCache: contentAnalysisCache.size,
    contradictionValidationCache: contradictionValidationCache.size
  };
}

// ---- CACHE CLEANUP ----
function performCacheCleanup() {
  // Clean up analysis caches with TTL
  let analysisCleanedCount = 0;
  for (const [key, cached] of contentAnalysisCache.entries()) {
    if (cached && (Date.now() - cached.timestamp > ANALYSIS_CACHE_TTL_MS)) {
      contentAnalysisCache.delete(key);
      analysisCleanedCount++;
    }
  }
  
  // Enforce size limit on analysis cache to prevent memory leaks
  if (contentAnalysisCache.size > MAX_ANALYSIS_CACHE_SIZE) {
    logger.debug("Analysis cache too large - removing oldest entries", {
      currentSize: contentAnalysisCache.size,
      maxSize: MAX_ANALYSIS_CACHE_SIZE
    });
    const entries = Array.from(contentAnalysisCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by timestamp
    const toRemove = Math.floor(MAX_ANALYSIS_CACHE_SIZE * 0.3); // Remove 30% of entries
    for (let i = 0; i < toRemove; i++) {
      contentAnalysisCache.delete(entries[i][0]);
    }
  }
  
  // Clean up validation cache when it grows too large
  if (contradictionValidationCache.size > config.cache.maxValidationCacheSize) {
    logger.debug("Clearing validation cache", {
      currentSize: contradictionValidationCache.size,
      maxSize: config.cache.maxValidationCacheSize
    });
    contradictionValidationCache.clear();
  }
  
  logger.info("Cache cleanup completed", {
    messageCacheSize: messageCache.size,
    analysisCacheSize: contentAnalysisCache.size,
    validationCacheSize: contradictionValidationCache.size
  });
}

// ---- DATABASE UTILITIES ----
async function resetAllData() {
  await resetDatabase();
  clearAllCaches();
}

module.exports = {
  // Classes
  LRUCache,
  
  // Cache instances
  messageCache,
  contentAnalysisCache,
  contradictionValidationCache,
  
  // Storage functions
  saveUserMessage,
  saveBotReply,
  fetchUserHistory,
  fetchChannelHistory,
  fetchUserMessagesForDetection,
  
  // Cache management
  clearAllCaches,
  getCacheStatus,
  performCacheCleanup,
  
  // Database utilities
  resetAllData,
  
  // Helper functions
  getDisplayName,
  getChannelName,
  getGuildName,
  getDisplayNameById
};

const { connect, resetDatabase } = require("./mongo");

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
const messageCache = new LRUCache(1000); // Cache up to 1000 different query results
const contentAnalysisCache = new Map(); // Cache content analysis results
const contradictionValidationCache = new Map(); // Cache validation results

// ---- STORAGE CONFIGURATION ----
const ANALYSIS_CACHE_TTL_MS = 60000; // 1 minute TTL for analysis cache
const MAX_CONTEXT_MESSAGES_PER_CHANNEL = 100;
const SUMMARY_BLOCK_SIZE = 20;
const TRIVIAL_HISTORY_THRESHOLD = 0.8; // 80% trivial = skip context LLM

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

function isTrivialOrSafeMessage(content) {
  if (!content || typeof content !== "string") return true;
  
  const trimmed = content.trim();
  const lower = trimmed.toLowerCase();
  
  // Quick length checks first (fastest)
  if (trimmed.length < 4) return true;
  if (trimmed.length > 200) return false; // Long messages are likely substantive
  
  // Cached trivial patterns for performance
  const TRIVIAL_PATTERNS = {
    safe: new Set([
      "hello", "hi", "hey", "ok", "okay", "yes", "no", "lol", "sure", "cool", "nice", "thanks",
      "thank you", "hey arbiter", "sup", "idk", "good morning", "good night", "haha", "lmao",
      "brb", "ttyl", "gtg", "omg", "wtf", "tbh", "imo", "ngl", "fr", "bet", "facts", "cap",
      "no cap", "word", "mood", "same", "this", "that", "what", "who", "when", "where", "why",
      "rip", "f", "oof", "yikes", "cringe", "based", "ratio", "w", "l", "cope", "seethe",
      "touch grass", "skill issue", "imagine", "sus", "among us", "poggers", "sheesh", "bussin"
    ]),
    
    // Compiled regex patterns for better performance
    onlyEmoji: /^[\p{Emoji}\s\p{P}]+$/u,
    onlyPunctuation: /^[.!?,:;'"()\[\]{}\-_+=<>|\\\/~`^*&%$#@]+$/,
    repeatedChars: /^(.)\1{2,}$/,
    shortAcronym: /^[a-z]{1,3}$/,
    onlyNumbers: /^\d+$/,
    reactionText: /^(same|this|true|real|facts|\+1|-1|agree|disagree)$/,
    
    // Discourse markers that add no substantive content
    fillerPhrases: /^(anyway|so|well|like|actually|basically|literally|honestly|obviously|clearly|wait|hold up|bruh|bro|dude|man|yo)$/,
    
    // Questions that don't assert anything substantive
    simpleQuestions: /^(what|who|when|where|why|how|really|seriously)\??$/,
    
    // Acknowledgments and reactions
    acknowledgments: /^(got it|i see|makes sense|fair enough|right|exactly|precisely|indeed|correct|wrong|nope|yep|yup|nah)$/
  };
  
  // Check cached safe words (O(1) lookup)
  if (TRIVIAL_PATTERNS.safe.has(lower)) return true;
  
  // Check compiled regex patterns (faster than multiple pattern checks)
  if (TRIVIAL_PATTERNS.onlyEmoji.test(content)) return true;
  if (TRIVIAL_PATTERNS.onlyPunctuation.test(content)) return true;
  if (TRIVIAL_PATTERNS.repeatedChars.test(lower)) return true;
  if (TRIVIAL_PATTERNS.onlyNumbers.test(lower)) return true;
  if (TRIVIAL_PATTERNS.shortAcronym.test(lower)) return true;
  if (TRIVIAL_PATTERNS.reactionText.test(lower)) return true;
  if (TRIVIAL_PATTERNS.fillerPhrases.test(lower)) return true;
  if (TRIVIAL_PATTERNS.simpleQuestions.test(lower)) return true;
  if (TRIVIAL_PATTERNS.acknowledgments.test(lower)) return true;
  
  // Advanced trivial detection
  const words = lower.split(/\s+/);
  
  // Single word reactions
  if (words.length === 1) {
    return true; // Most single words are reactions
  }
  
  // Repeated words/phrases
  if (words.length <= 3 && new Set(words).size === 1) {
    return true; // "no no no", "yes yes", etc.
  }
  
  // All words are from safe set
  if (words.length <= 5 && words.every(word => TRIVIAL_PATTERNS.safe.has(word))) {
    return true; // Combinations of safe words
  }
  
  return false;
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
    console.log(`[CACHE HIT] User history for ${userId} (${cachedMessages.length} cached messages)`);
    return cachedMessages.slice(0, limit);
  }
  
  // Cache miss or insufficient data - fetch from MongoDB
  console.log(`[CACHE MISS] User history for ${userId} - fetching from MongoDB`);
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
        console.warn("Summary error:", e);
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
    console.warn("DB insert error (bot reply):", e);
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
  for (const [key, cached] of contentAnalysisCache.entries()) {
    if (cached && (Date.now() - cached.timestamp > ANALYSIS_CACHE_TTL_MS)) {
      contentAnalysisCache.delete(key);
    }
  }
  
  // Clean up validation cache when it grows too large
  if (contradictionValidationCache.size > 1000) {
    console.log(`[DEBUG] Clearing validation cache (${contradictionValidationCache.size} entries)`);
    contradictionValidationCache.clear();
  }
  
  console.log(`[DEBUG] Cache cleanup: messages=${messageCache.size}, analysis=${contentAnalysisCache.size}, validation=${contradictionValidationCache.size}`);
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
  getDisplayNameById,
  isTrivialOrSafeMessage
};

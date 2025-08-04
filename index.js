const express = require(“express”);
const { Client, GatewayIntentBits } = require(“discord.js”);
const { GoogleGenerativeAI } = require(”@google/generative-ai”);
const mongoose = require(“mongoose”);

// Import all your fact-checking services
const ClaimExtractor = require(”./services/claimExtractor”);
const FactChecker = require(”./services/factChecker”);
const SourceVerifier = require(”./services/sourceVerifier”);
const ContradictionDetector = require(”./services/contradictionDetector”);
const InteractiveVerifier = require(”./services/interactiveVerifier”);
const WebSearch = require(”./services/webSearch”);
const ContentFetcher = require(”./services/contentFetcher”);
const ThreadContextAnalyzer = require(”./services/threadContextAnalyzer”);

// Import utilities
const ConfidenceScorer = require(”./utils/confidenceScorer”);
const ErrorHandler = require(”./utils/errorHandler”);
const Logger = require(”./utils/logger”);
const CacheManager = require(”./utils/cacheManager”);
const ParallelProcessor = require(”./utils/parallelProcessor”);

// Import models
const FactCheck = require(”./models/FactCheck”);

// 🌐 Web server (keeps hosting platform alive)
const app = express();
app.get(”/”, (*, res) => res.send(“Arbiter is online and fact-checking with Gemini AI.”));
app.get(”/health”, (*, res) => res.json({
status: “healthy”,
timestamp: new Date().toISOString(),
services: “fact-checking active”,
ai_provider: “Google Gemini”
}));
app.listen(process.env.PORT || 3000, () => console.log(“🌐 Web server running.”));

// 🔐 Environment validation
const requiredEnvVars = [
‘DISCORD_TOKEN’,
‘GEMINI_API_KEY’,
‘MONGODB_URI’,
‘GOOGLE_SEARCH_API_KEY’ // or EXA_API_KEY if using Exa
];

for (const envVar of requiredEnvVars) {
if (!process.env[envVar]) {
console.error(`❌ Missing required environment variable: ${envVar}`);
process.exit(1);
}
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || process.env.EXA_API_KEY;

// 🤖 Google Gemini AI Setup
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Model configurations for different use cases
const MODELS = {
// For summary, fact-checking, web searching, context verification
BACKGROUND: “gemini-2.0-flash-exp”, // Use latest available model for background tasks
// For actual message responses (primary)
RESPONSE_PRIMARY: “gemini-2.0-flash-exp”, // Use latest available model
// Fallback for message responses
RESPONSE_FALLBACK: “gemini-1.5-flash”
};

// Gemini AI helper class
class GeminiAI {
constructor() {
this.backgroundModel = genAI.getGenerativeModel({
model: MODELS.BACKGROUND,
generationConfig: {
temperature: 0,
topP: 0.8,
topK: 40,
maxOutputTokens: 2048,
}
});

```
this.responseModel = genAI.getGenerativeModel({ 
  model: MODELS.RESPONSE_PRIMARY,
  generationConfig: {
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 1024,
  }
});

this.fallbackModel = genAI.getGenerativeModel({ 
  model: MODELS.RESPONSE_FALLBACK,
  generationConfig: {
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 1024,
  }
});
```

}

// For background processing (fact-checking, analysis, etc.)
async generateBackground(prompt, systemPrompt = null) {
try {
const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
const result = await this.backgroundModel.generateContent(fullPrompt);
return result.response.text();
} catch (error) {
console.error(“Gemini background generation error:”, error);
throw error;
}
}

// For user-facing responses with fallback
async generateResponse(prompt, systemPrompt = null) {
try {
const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
const result = await this.responseModel.generateContent(fullPrompt);
return result.response.text();
} catch (error) {
console.warn(“Primary response model failed, trying fallback:”, error.message);
try {
const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
const result = await this.fallbackModel.generateContent(fullPrompt);
return result.response.text();
} catch (fallbackError) {
console.error(“Both response models failed:”, fallbackError);
throw fallbackError;
}
}
}

// For JSON responses (fact-checking analysis)
async generateJSON(prompt, systemPrompt) {
try {
const fullPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. No other text.\n\n${prompt}`;
const result = await this.backgroundModel.generateContent(fullPrompt);
const text = result.response.text().trim();

```
  // Clean up the response to extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  } else {
    return JSON.parse(text);
  }
} catch (error) {
  console.error("Gemini JSON generation error:", error);
  throw error;
}
```

}

// Convert OpenAI-style messages to Gemini prompt
convertMessagesToPrompt(messages) {
return messages.map(msg => {
if (msg.role === ‘system’) {
return `SYSTEM: ${msg.content}`;
} else if (msg.role === ‘user’) {
return `USER: ${msg.content}`;
} else if (msg.role === ‘assistant’) {
return `ASSISTANT: ${msg.content}`;
}
return msg.content;
}).join(’\n\n’);
}
}

// Initialize Gemini AI
const geminiAI = new GeminiAI();

// 🧠 MongoDB Setup with better error handling
mongoose.connect(MONGODB_URI, {
useNewUrlParser: true,
useUnifiedTopology: true,
}).then(() => {
console.log(“✅ Connected to MongoDB”);
}).catch(err => {
console.error(“❌ MongoDB connection failed:”, err);
process.exit(1);
});

// Enhanced schemas
const memorySchema = new mongoose.Schema({
userId: String,
context: Array,
summary: String,
preferences: String,
factCheckHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: ‘FactCheck’ }],
trustScore: { type: Number, default: 1.0 },
lastActive: { type: Date, default: Date.now }
});

const channelMemorySchema = new mongoose.Schema({
channelId: String,
messages: Array,
recentClaims: Array,
flaggedMessages: Array,
lastCleaned: { type: Date, default: Date.now }
});

const Memory = mongoose.model(“Memory”, memorySchema);
const ChannelMemory = mongoose.model(“ChannelMemory”, channelMemorySchema);

// 🤖 Initialize services with Gemini AI
const logger = new Logger();
const errorHandler = new ErrorHandler(logger);
const cacheManager = new CacheManager();

// Initialize fact-checking pipeline with Gemini AI
const webSearch = new WebSearch(SEARCH_API_KEY);
const contentFetcher = new ContentFetcher();
const sourceVerifier = new SourceVerifier(geminiAI, webSearch, contentFetcher, cacheManager, errorHandler);
const factChecker = new FactChecker(geminiAI, sourceVerifier, cacheManager, errorHandler);
const claimExtractor = new ClaimExtractor(geminiAI, errorHandler);
const contradictionDetector = new ContradictionDetector(geminiAI, errorHandler);
const confidenceScorer = new ConfidenceScorer(geminiAI);
const threadContextAnalyzer = new ThreadContextAnalyzer(geminiAI, errorHandler);
const interactiveVerifier = new InteractiveVerifier(geminiAI, errorHandler);
const parallelProcessor = new ParallelProcessor(logger);

// Enhanced memory functions
async function loadMemory(userId) {
let doc = await Memory.findOne({ userId });
if (!doc) {
doc = new Memory({ userId, context: [], summary: “”, preferences: “” });
await doc.save();
}
doc.lastActive = new Date();
await doc.save();
return doc;
}

async function saveMemory(userId, context, summary, preferences = null) {
const trimmed = context.slice(-20);
const update = {
context: trimmed,
lastActive: new Date()
};
if (summary) update.summary = summary;
if (preferences !== null) update.preferences = preferences;
await Memory.findOneAndUpdate({ userId }, update, { upsert: true });
}

async function loadChannelMemory(channelId) {
let doc = await ChannelMemory.findOne({ channelId });
if (!doc) {
doc = new ChannelMemory({ channelId, messages: [], recentClaims: [], flaggedMessages: [] });
await doc.save();
}
return doc;
}

async function saveChannelMessage(channelId, messageObj) {
const doc = await loadChannelMemory(channelId);
const updated = […doc.messages, messageObj].slice(-50); // Keep more context
await ChannelMemory.findOneAndUpdate({ channelId }, { messages: updated });
}

// 📘 Enhanced system prompt with fact-checking awareness
const AIPrompt = (date, summary, preferences, factCheckContext = null) => `
You are Arbiter, the wise assistant of The Debate Server Discord community.
You provide logical insights, calm judgment, and philosophical clarity while helping maintain factual accuracy.

Core traits: Direct, succinct, humble, stoic, and committed to truth.
Keep responses brief and focused on key facts.

Today’s date: ${date}
User summary: ${summary || “New user”}
User preferences: ${preferences || “None”}

${factCheckContext ? `IMPORTANT: Recent fact-checking context: ${factCheckContext} If you recently flagged misinformation, maintain a helpful and educational tone. Focus on media literacy and encourage source verification rather than confrontation.` : ‘’}

When appropriate, encourage users to:

- Verify claims with multiple sources
- Consider source credibility and bias
- Think critically about information
- Ask for evidence when making claims

Avoid being preachy - integrate these naturally into conversation.
`;

// 🔍 Core fact-checking pipeline
async function analyzeMessageForMisinformation(message, userId, channelId) {
try {
logger.info(`Starting fact-check analysis for message from user ${userId}`);

```
// Step 1: Extract potential claims
const claims = await claimExtractor.extractClaims(message.content);

if (!claims || claims.length === 0) {
  logger.info("No verifiable claims found in message");
  return null;
}

logger.info(`Found ${claims.length} potential claims to verify`);

// Step 2: Get thread context
const threadContext = await threadContextAnalyzer.analyzeContext(channelId, message.content);

// Step 3: Process claims in parallel for efficiency
const claimResults = await parallelProcessor.processBatch(
  claims,
  async (claim) => {
    logger.info(`Processing claim: "${claim.substring(0, 100)}..."`);
    
    // Fact-check the claim
    const factCheckResult = await factChecker.verifyClaimMultiStep(claim);
    
    // Check for contradictions in user's message history
    const userDoc = await loadMemory(userId);
    const contradictions = await contradictionDetector.findContradictions(
      claim, 
      userDoc.context.map(c => c.content).join(' ')
    );
    
    return { claim, factCheckResult, contradictions };
  },
  2 // Process 2 claims at a time
);

// Step 4: Analyze overall confidence and determine action
const analysis = await confidenceScorer.analyzeResults(
  claimResults.map(r => r.factCheckResult),
  claimResults.flatMap(r => r.contradictions || [])
);

// Step 5: Save fact-check record
if (analysis.should_flag || analysis.confidence > 0.5) {
  const factCheckRecord = new FactCheck({
    originalMessage: message.content,
    userId: userId,
    channelId: channelId,
    claims: claimResults.map(r => r.claim),
    analysis: analysis,
    timestamp: new Date(),
    confidence: analysis.confidence,
    flagged: analysis.should_flag
  });
  
  await factCheckRecord.save();
  
  // Update user's fact-check history
  await Memory.findOneAndUpdate(
    { userId },
    { $push: { factCheckHistory: factCheckRecord._id } }
  );
}

logger.info(`Fact-check complete. Should flag: ${analysis.should_flag}, Confidence: ${analysis.confidence}`);

return analysis;
```

} catch (error) {
logger.error(“Fact-checking pipeline error:”, error);
await errorHandler.handleError(error, {
service: ‘fact-checking-pipeline’,
userId,
channelId,
messageContent: message.content.substring(0, 100)
});
return null;
}
}

// 🎯 Enhanced message processing with Gemini AI
async function generateSummary(context) {
try {
const systemPrompt = “Summarize this user’s personality, interests, beliefs, and communication patterns based on their recent conversation history. Include any notable claims they’ve made. Be concise and informative.”;
const userMessages = context.slice(-15).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join(’\n\n’);

```
const summary = await geminiAI.generateBackground(userMessages, systemPrompt);
return summary;
```

} catch (error) {
logger.error(“Summary generation error:”, error);
return “Unable to generate user summary”;
}
}

async function detectUserPreferenceRequest(context, input) {
try {
const systemPrompt = `
You identify if a user is expressing long-term instructions for how they want to be treated.

Examples of preferences:

- “talk to me more formally”
- “call me captain”
- “be more sarcastic”
- “don’t fact-check my messages”
- “remind me to cite sources”

If there is a persistent preference in the message, reply with the user’s request in natural language.
If there is no persistent preference, reply exactly with “none”.
`;

```
const conversationContext = context.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
const prompt = `${conversationContext}\n\nUSER: ${input}\n\nDoes this contain a persistent preference?`;

const response = await geminiAI.generateBackground(prompt, systemPrompt);
const output = response.trim();
return output.toLowerCase() === "none" ? null : output;
```

} catch (err) {
logger.error(“Preference detection error:”, err);
return null;
}
}

// 🤖 Enhanced Discord Bot Setup
const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.DirectMessages,
],
});

// Track processing to avoid duplicate fact-checks
const processingMessages = new Set();

client.on(“messageCreate”, async (message) => {
if (message.author.bot) return;
if (processingMessages.has(message.id)) return;

processingMessages.add(message.id);

try {
const isMentioned = message.mentions.users.has(client.user.id);
const isRepliedTo = message.reference?.messageId
? (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id
: false;

```
const input = message.content.trim();
const userId = message.author.id;
const channelId = message.channel.id;

// Always save channel message for context
await saveChannelMessage(channelId, {
  username: message.author.username,
  content: input,
  timestamp: new Date(),
  userId: userId
});

// Background fact-checking for all messages (but only respond if flagged)
let factCheckResult = null;
if (input.length > 20) { // Only fact-check substantial messages
  factCheckResult = await analyzeMessageForMisinformation(message, userId, channelId);
}

// Handle fact-checking flags
if (factCheckResult && factCheckResult.should_flag) {
  logger.info(`Misinformation flagged from user ${userId}: ${factCheckResult.reason}`);
  
  // Send educational response
  const educational = `🔍 **Media Literacy Note**\n\n${factCheckResult.educational_response}\n\n` +
    `${factCheckResult.sources && factCheckResult.sources.length > 0 ? 
      `**Helpful sources:**\n${factCheckResult.sources.slice(0, 3).map(s => `• [${s.title}](${s.url})`).join('\n')}` : 
      '**Consider checking multiple reliable sources before sharing claims.**'}\n\n` +
    `*This is an automated fact-checking service to help maintain information quality.*`;
  
  await message.reply(educational);
}

// Regular chat responses (only for mentions/replies)
if (isMentioned || isRepliedTo) {
  const userDoc = await loadMemory(userId);
  const channelDoc = await loadChannelMemory(channelId);
  const userContext = [...userDoc.context, { role: "user", content: input }];
  const channelContext = channelDoc.messages.slice(-10).map((msg) => ({
    role: "user",
    content: `${msg.username}: ${msg.content}`,
  }));

  const newPref = await detectUserPreferenceRequest(userContext, input);
  const updatedPreferences = newPref || userDoc.preferences;

  await message.channel.sendTyping();

  const displayName = message.member?.displayName || message.author.username;
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Include fact-check context if relevant
  let factCheckContext = null;
  if (factCheckResult) {
    factCheckContext = `Recently analyzed claims in this conversation. Confidence level: ${Math.round(factCheckResult.confidence * 100)}%`;
  }

  // Prepare conversation for Gemini
  const systemPrompt = AIPrompt(currentDate, userDoc.summary, updatedPreferences, factCheckContext);
  const conversationPrompt = [
    ...channelContext.map(msg => msg.content),
    ...userContext.slice(-10).map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
  ].join('\n\n');

  const reply = await geminiAI.generateResponse(conversationPrompt, systemPrompt);
  await message.reply(`${displayName},\n\n${reply}`);

  const updatedContext = [...userContext, { role: "assistant", content: reply }];
  let updatedSummary = userDoc.summary;

  if (updatedContext.length % 12 === 0) {
    updatedSummary = await generateSummary(updatedContext.slice(-20));
  }

  await saveMemory(userId, updatedContext, updatedSummary, updatedPreferences);
}
```

} catch (err) {
logger.error(“Message processing error:”, err);
if (isMentioned || isRepliedTo) {
await message.reply(“I encountered an issue processing your message. Please try again.”);
}
} finally {
processingMessages.delete(message.id);
}
});

// Enhanced bot startup
client.on(“ready”, () => {
console.log(`🟢 Arbiter online as ${client.user.tag}`);
console.log(`🤖 Powered by Google Gemini AI`);
console.log(`📊 Fact-checking services initialized`);
console.log(`🔍 Monitoring for misinformation across ${client.guilds.cache.size} servers`);

// Set activity status
client.user.setActivity(‘for misinformation’, { type: ‘WATCHING’ });
});

// Graceful error handling
client.on(“error”, (error) => {
logger.error(“Discord client error:”, error);
});

process.on(‘unhandledRejection’, (reason, promise) => {
logger.error(‘Unhandled Rejection at:’, promise, ‘reason:’, reason);
});

process.on(‘uncaughtException’, (error) => {
logger.error(‘Uncaught Exception:’, error);
process.exit(1);
});

// Periodic cleanup
setInterval(async () => {
try {
// Clean old channel messages
await ChannelMemory.updateMany(
{ lastCleaned: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
{
$set: { messages: [], lastCleaned: new Date() },
$unset: { recentClaims: 1 }
}
);

```
// Clear processing cache
processingMessages.clear();

logger.info("Periodic cleanup completed");
```

} catch (error) {
logger.error(“Cleanup error:”, error);
}
}, 60 * 60 * 1000); // Every hour

client.login(DISCORD_TOKEN);
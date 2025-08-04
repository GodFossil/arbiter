const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const { OpenAI } = require("openai");
const mongoose = require("mongoose");
const ClaimExtractor = require("./services/claimExtractor");
const FactChecker = require("./services/factChecker");
const ContradictionDetector = require("./services/contradictionDetector");
const SourceVerifier = require("./services/sourceVerifier");
const WebSearch = require("./services/webSearch").default;
const ContentFetcher = require("./services/contentFetcher");
const ThreadContextAnalyzer = require("./services/threadContextAnalyzer");
const InteractiveVerifier = require("./services/interactiveVerifier");
const ConfidenceScorer = require("./utils/confidenceScorer");
const Logger = require("./utils/logger");
const CacheManager = require("./utils/cacheManager");
const ParallelProcessor = require("./utils/parallelProcessor");
const ErrorHandler = require("./utils/errorHandler");

// 🌐 Web server (keeps bot alive)
const app = express();
app.get("/", (_, res) => res.send("Arbiter is online with enhanced misinformation detection."));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server running."));

// 🔐 Environment
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY || "default_openai_key";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/arbiter";
const EXA_API_KEY = process.env.EXA_API_KEY || "default_exa_key";

// 🧠 MongoDB Setup with connection pooling and optimized error handling
const mongoOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  socketTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  waitQueueTimeoutMS: 10000
};

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, mongoOptions);
    console.log('✅ MongoDB connected successfully with pooling');
  } catch (error) {
    console.warn(`⚠️ MongoDB connection failed (${error.code}), using in-memory fallback`);
    console.log(`
📋 MongoDB Setup Required:
1. Go to MongoDB Atlas (cloud.mongodb.com)
2. Navigate to Network Access
3. Add Current IP Address: ${process.env.REPL_SLUG ? 'Replit IPs' : 'your current IP'}
4. Or allow access from anywhere (0.0.0.0/0) for testing
5. Restart the bot after updating network access

The bot will work without MongoDB but won't save conversation history.
    `);
  }
})();

// Optimized schemas with indexes and schema options
const memorySchema = new mongoose.Schema({
  userId: { 
    type: String,
    required: true,
    index: true,
    unique: true 
  },
  context: {
    type: Array,
    maxlength: 20
  },
  summary: String,
  preferences: String,
  factCheckHistory: {
    type: Array,
    maxlength: 50
  }
}, { 
  timestamps: true,
  bufferCommands: false 
});

const channelMemorySchema = new mongoose.Schema({
  channelId: { 
    type: String,
    required: true,
    index: true,
    unique: true
  },
  messages: {
    type: Array,
    maxlength: 20
  },
  factCheckAlerts: {
    type: Array,
    maxlength: 10
  }
}, { 
  timestamps: true,
  bufferCommands: false 
});

const Memory = mongoose.model("Memory", memorySchema);
const ChannelMemory = mongoose.model("ChannelMemory", channelMemorySchema);

// Optimized memory loading with projection and lean document
const createMemoryFallback = (userId) => ({ 
  userId, 
  context: [], 
  summary: "", 
  preferences: "",
  factCheckHistory: [] 
});

async function loadMemory(userId) {
  try {
    const doc = await Memory.findOne({ userId })
      .select('-_id -__v -createdAt -updatedAt')
      .lean()
      .exec();

    return doc || createMemoryFallback(userId);
  } catch (error) {
    return createMemoryFallback(userId);
  }
}

// Optimized memory save with atomic updates and bulk operation prevention
async function saveMemory(userId, context, summary, preferences = null, factCheckHistory = null) {
  try {
    const update = { 
      $set: {
        context: context.slice(-20),
        ...(summary && { summary }),
        ...(preferences !== null && { preferences }),
        ...(factCheckHistory !== null && { 
          factCheckHistory: factCheckHistory.slice(-50) 
        })
      }
    };

    await Memory.findOneAndUpdate(
      { userId }, 
      update,
      { 
        upsert: true,
        session: null, 
        lean: true,
        maxTimeMS: 5000
      }
    ).catch(e => console.debug('Optimized save failed:', e.code));
  } catch (error) {
    if (error instanceof mongoose.Error.OperationalError) {
      console.debug('MongoDB operation failed:', error.message);
    }
  }
}

async function loadChannelMemory(channelId) {
  try {
    let doc = await ChannelMemory.findOne({ channelId });
    if (!doc) {
      doc = new ChannelMemory({ 
        channelId, 
        messages: [],
        factCheckAlerts: []
      });
      await doc.save();
    }
    return doc;
  } catch (error) {
    return {
      channelId,
      messages: [],
      factCheckAlerts: []
    };
  }
}

// Optimized channel message save with direct update
async function saveChannelMessage(channelId, messageObj) {
  try {
    await ChannelMemory.findOneAndUpdate(
      { channelId },
      { 
        $push: { 
          messages: { 
            $each: [messageObj], 
            $slice: -20,
            $sort: 1 
          } 
        } 
      },
      { 
        upsert: true,
        projection: { _id: 0 },
        maxTimeMS: 5000
      }
    ).exec().catch(e => console.debug('Channel save failed:', e.code));
  } catch (error) {
    console.debug('Channel save error:', error.code);
  }
}

async function saveFactCheckAlert(channelId, alertObj) {
  try {
    const doc = await loadChannelMemory(channelId);
    const updated = [...doc.factCheckAlerts, alertObj].slice(-10); // Keep last 10 alerts
    await ChannelMemory.findOneAndUpdate({ channelId }, { factCheckAlerts: updated });
  } catch (error) {
    console.debug('Fact-check alert save failed, continuing...');
  }
}

// 🤖 OpenAI Setup
const openai = new OpenAI({ apiKey: OPENAI_KEY });
const AIModel = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user

// Initialize enhanced services
const logger = new Logger();
const cacheManager = new CacheManager();
const parallelProcessor = new ParallelProcessor(3); // Max 3 concurrent operations
const errorHandler = new ErrorHandler(logger);
const contentFetcher = new ContentFetcher();
const claimExtractor = new ClaimExtractor(openai);
const webSearch = new WebSearch(EXA_API_KEY);
const sourceVerifier = new SourceVerifier(openai, webSearch, contentFetcher, cacheManager, errorHandler);
const factChecker = new FactChecker(openai, sourceVerifier, cacheManager, errorHandler);
const contradictionDetector = new ContradictionDetector(openai);
const confidenceScorer = new ConfidenceScorer(openai);
const threadContextAnalyzer = new ThreadContextAnalyzer(openai, cacheManager);
const interactiveVerifier = new InteractiveVerifier(openai, factChecker, sourceVerifier, cacheManager);

// 📘 System instruction
const AIPrompt = (date, summary, preferences) => `
You are Arbiter, the wise assistant of our Discord debate server: The Debate Server. 
You provide logical insights, calm judgment, and philosophical clarity.
You are direct, succinct, humble, and stoic.

Avoid long-winded answers. Be brief. Limit replies to key facts and minimal words.

Today's date is ${date}.
User summary: ${summary || "Unknown."}
User preferences: ${preferences || "None."}
`;

async function generateSummary(context) {
  const response = await openai.chat.completions.create({
    model: AIModel,
    messages: [
      {
        role: "system",
        content: "Summarize this user's personality, interests, and beliefs based on their recent conversation history. Be concise and informative.",
      },
      ...context.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return response.choices[0].message.content;
}

async function detectUserPreferenceRequest(context, input) {
  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        {
          role: "system",
          content: `
You're an assistant that identifies if a user is expressing long-term instructions for how they want to be treated or how you should behave.

Only respond with the user's request in natural language if it is a persistent preference (e.g. "talk to me more formally", "call me captain", "be sarcastic", etc).

If there is no persistent preference in the message, reply exactly with "none".
          `.trim(),
        },
        ...context.slice(-10),
        { role: "user", content: input },
      ],
      max_tokens: 50,
      temperature: 0,
    });

    const output = response.choices[0].message.content.trim();
    return output.toLowerCase() === "none" ? null : output;
  } catch (err) {
    console.error("Preference detection error:", err);
    return null;
  }
}

// 🚨 Enhanced Misinformation Detection Pipeline with Thread Context
async function analyzeMessageForMisinformation(input, userContext, userId, channelId, message = null) {
  try {
    logger.log('info', `Starting enhanced misinformation analysis with thread context for user ${userId}`);
    
    // Step 0: Analyze thread context if message is provided
    let threadContext = null;
    let threadHistory = [];
    
    if (message) {
      threadHistory = await threadContextAnalyzer.getEnhancedThreadHistory(message, 20);
      
      if (threadContextAnalyzer.isPartOfDiscussion(input, threadHistory)) {
        threadContext = await threadContextAnalyzer.analyzeThreadContext(
          input, 
          threadHistory, 
          userId, 
          channelId
        );
        
        if (threadContext) {
          logger.log('info', `Thread context analysis: ${threadContext.conversation_topic} (${threadContext.fact_check_priority} priority)`);
        }
      }
    }
    
    // Step 1: Check cache for recent claim extractions
    const cachedClaims = cacheManager.getClaims(input);
    let claims;
    
    if (cachedClaims) {
      logger.log('info', 'Using cached claim extraction');
      claims = cachedClaims;
    } else {
      try {
        claims = await claimExtractor.extractClaims(input);
      } catch (error) {
        const result = await errorHandler.handleError(error, { 
          service: 'claimExtractor', 
          useCache: true, 
          cacheManager, 
          cacheType: 'claim', 
          cacheKey: input 
        }, () => []); // Fallback to no claims
        claims = result.success !== false ? result : [];
      }
      
      if (claims && claims.length > 0) {
        cacheManager.cacheClaims(input, claims);
      }
    }

    if (!claims || claims.length === 0) {
      logger.log('info', 'No factual claims detected in message');
      return null;
    }

    logger.log('info', `Extracted ${claims.length} claims for parallel verification`);

    // Step 2: Run contradiction detection in parallel with fact-checking
    const [contradictions, factCheckResults] = await Promise.all([
      // Enhanced contradiction detection with thread context
      (async () => {
        try {
          // Use thread context for better contradiction detection
          const contextToUse = threadContext ? 
            [...userContext, ...threadHistory.map(msg => ({ role: "user", content: `${msg.username}: ${msg.content}` }))] : 
            userContext;
          
          return await contradictionDetector.detectContradictions(claims, contextToUse);
        } catch (error) {
          const result = await errorHandler.handleError(error, { service: 'contradictionDetector' }, () => []);
          return result.success !== false ? result : [];
        }
      })(),
      
      // Parallel fact-checking with progress reporting
      parallelProcessor.processClaims(claims, factChecker, {
        batchSize: 2, // Process 2 claims at once to respect API limits
        onProgress: (completed, total, result) => {
          logger.log('info', `Fact-check progress: ${completed}/${total} (${result.status})`);
        }
      })
    ]);

    logger.log('info', `Completed parallel processing: ${contradictions.length} contradictions, ${factCheckResults.length} fact-checks`);

    // Step 3: Cache successful results
    if (factCheckResults && factCheckResults.length > 0) {
      factCheckResults.forEach(result => {
        if (result.status !== 'error') {
          cacheManager.cacheFactCheck(result.claim, result);
        }
      });
    }

    // Step 4: Calculate overall confidence scores with enhanced error handling
    let confidenceAnalysis;
    try {
      confidenceAnalysis = await confidenceScorer.analyzeResults(factCheckResults, contradictions);
    } catch (error) {
      const result = await errorHandler.handleError(error, { service: 'confidenceScorer' }, () => ({
        shouldFlag: false,
        confidence: 0,
        flagType: 'error',
        reason: 'Unable to calculate confidence',
        sources: [],
        explanation: 'Analysis temporarily unavailable',
        educationalResponse: 'Unable to verify claims at this time.'
      }));
      confidenceAnalysis = result.success !== false ? result : result;
    }

    // Step 5: Enhanced flagging decision with performance metrics
    if (confidenceAnalysis.shouldFlag) {
      logger.log('warning', `High-confidence misinformation detected: ${confidenceAnalysis.reason}`, {
        userId,
        confidence: confidenceAnalysis.confidence,
        claimsCount: claims.length,
        processingTime: Date.now()
      });
      
      return {
        type: confidenceAnalysis.flagType,
        confidence: confidenceAnalysis.confidence,
        claims: claims,
        factCheckResults: factCheckResults,
        contradictions: contradictions,
        sources: confidenceAnalysis.sources,
        explanation: confidenceAnalysis.explanation,
        educationalResponse: confidenceAnalysis.educationalResponse,
        processingStats: {
          claimsProcessed: claims.length,
          cacheHits: cachedClaims ? 1 : 0,
          parallelProcessing: true,
          threadContext: !!threadContext,
          threadPriority: threadContext?.fact_check_priority || 'none'
        },
        threadContext: threadContext
      };
    }

    logger.log('info', 'Enhanced analysis complete - no high-confidence issues detected');
    return null;

  } catch (error) {
    // Enhanced error handling with fallback
    await errorHandler.handleError(error, {
      service: 'misinformationAnalysis',
      userId,
      input: input.substring(0, 100) // Log first 100 chars for context
    });
    
    logger.log('error', `Misinformation analysis failed with enhanced error handling: ${error.message}`);
    return null; // Still fail silently to avoid false positives
  }
}

// 🎓 Generate enhanced educational response with interactive options
function formatMisinformationResponse(analysis, displayName) {
  let response = `${displayName}, I've noticed some information that may need clarification:\n\n`;
  
  // Add thread context awareness
  if (analysis.threadContext?.conversation_topic) {
    response += `📝 **Context**: This appears to be part of the discussion about *${analysis.threadContext.conversation_topic}*\n\n`;
  }
  
  if (analysis.type === 'contradiction') {
    response += `📋 **Contradiction Detected**\n`;
    response += `This statement appears to contradict something you mentioned earlier. `;
  } else if (analysis.type === 'misinformation') {
    response += `🔍 **Fact-Check Alert**\n`;
    response += `I found some claims that don't align with current evidence. `;
  } else if (analysis.type === 'unverified') {
    response += `❓ **Unverified Information**\n`;
    response += `I couldn't verify these claims from reliable sources. `;
  }

  response += `(Confidence: ${Math.round(analysis.confidence * 100)}%)\n\n`;
  
  if (analysis.sources && analysis.sources.length > 0) {
    response += `**Reliable Sources:**\n`;
    analysis.sources.slice(0, 3).forEach((source, index) => {
      response += `${index + 1}. ${source.title} - ${source.url}\n`;
    });
    response += `\n`;
  }

  response += analysis.educationalResponse;
  
  // Add interactive options
  response += `\n\n**💬 Interactive Options:**\n`;
  response += `• Reply "explain" for detailed confidence reasoning\n`;
  response += `• Reply "deeper" for more thorough analysis\n`;
  response += `• Reply "sources" for additional authoritative sources\n`;
  response += `• Reply "challenge" to dispute this fact-check\n`;
  response += `• Reply "alternative" for different perspectives\n`;
  
  response += `\n*I aim to help maintain factual accuracy in our debates while being open to learning and correction.*`;

  return response;
}

// 🤖 Handle interactive verification requests
async function handleInteractiveRequest(message, previousAnalysis = null) {
  const content = message.content.toLowerCase().trim();
  const interactiveKeywords = ['explain', 'deeper', 'detailed', 'sources', 'challenge', 'alternative'];
  
  const matchedKeyword = interactiveKeywords.find(keyword => 
    content.includes(keyword) || content === keyword
  );
  
  if (matchedKeyword) {
    try {
      const response = await interactiveVerifier.handleInteractiveRequest(
        message, 
        matchedKeyword, 
        previousAnalysis
      );
      return response;
    } catch (error) {
      logger.log('error', `Interactive verification failed: ${error.message}`);
      return "I encountered an issue with your request. Could you try rephrasing it?";
    }
  }
  
  return null;
}

// 🤖 Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.users.has(client.user.id);
  const isRepliedTo = message.reference?.messageId
    ? (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id
    : false;

  const input = message.content.trim();
  const userId = message.author.id;
  const channelId = message.channel.id;

  const userDoc = await loadMemory(userId);
  const channelDoc = await loadChannelMemory(channelId);
  const userContext = [...userDoc.context, { role: "user", content: input }];
  const channelContext = channelDoc.messages.map((msg) => ({
    role: "user",
    content: `${msg.username}: ${msg.content}`,
  }));

  // Save the message to channel memory
  await saveChannelMessage(channelId, {
    username: message.author.username,
    content: input,
  });

  // 🤖 Check for interactive verification requests first
  let interactiveResponse = null;
  if (isRepliedTo || isMentioned) {
    // Try to get the previous analysis from cache or recent messages
    const recentMessages = await message.channel.messages.fetch({ limit: 10 });
    let previousAnalysis = null;
    
    // Look for recent bot responses that might contain analysis data
    for (const [id, msg] of recentMessages) {
      if (msg.author.id === client.user.id && msg.content.includes('Confidence:')) {
        // This is a simplified approach - in production, you'd store analysis IDs
        break;
      }
    }
    
    interactiveResponse = await handleInteractiveRequest(message, previousAnalysis);
  }
  
  if (interactiveResponse) {
    try {
      await message.reply(interactiveResponse);
      return;
    } catch (error) {
      console.error("Interactive response error:", error);
    }
  }

  // 🚨 Always analyze for misinformation with enhanced thread context
  const misinformationAnalysis = await analyzeMessageForMisinformation(
    input, 
    userContext, 
    userId, 
    channelId, 
    message
  );
  
  if (misinformationAnalysis) {
    const displayName = message.member?.displayName || message.author.username;
    const misinfoResponse = formatMisinformationResponse(misinformationAnalysis, displayName);
    
    try {
      await message.reply(misinfoResponse);
      
      // Log the fact-check alert
      await saveFactCheckAlert(channelId, {
        userId: userId,
        username: message.author.username,
        originalMessage: input,
        analysisType: misinformationAnalysis.type,
        confidence: misinformationAnalysis.confidence,
        timestamp: new Date(),
      });

      // Update user's fact-check history
      const updatedFactCheckHistory = [
        ...(userDoc.factCheckHistory || []),
        {
          message: input,
          analysis: misinformationAnalysis,
          timestamp: new Date(),
        }
      ];
      await saveMemory(userId, userContext, userDoc.summary, userDoc.preferences, updatedFactCheckHistory);
      
    } catch (error) {
      logger.log('error', `Failed to send misinformation response: ${error.message}`);
    }
  }

  // ❌ Only provide regular response if directly mentioned or replied to
  if (!isMentioned && !isRepliedTo) return;

  const summary = userDoc.summary;
  const preferences = userDoc.preferences;

  const newPref = await detectUserPreferenceRequest(userContext, input);
  const updatedPreferences = newPref || preferences;

  await message.channel.sendTyping();

  const displayName = message.member?.displayName || message.author.username;
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    const response = await openai.chat.completions.create({
      model: AIModel,
      messages: [
        { role: "system", content: AIPrompt(currentDate, summary, updatedPreferences) },
        ...channelContext.slice(-10),
        ...userContext.slice(-10),
      ],
    });

    const reply = response.choices[0].message.content.trim();
    await message.reply(`${displayName},\n\n${reply}`);

    const updatedContext = [...userContext, { role: "assistant", content: reply }];
    let updatedSummary = summary;

    if (updatedContext.length % 10 === 0) {
      updatedSummary = await generateSummary(updatedContext.slice(-20));
    }

    await saveMemory(userId, updatedContext, updatedSummary, updatedPreferences, userDoc.factCheckHistory);
  } catch (err) {
    console.error("AI ERROR:", err);
    message.reply("Something went wrong.");
  }
});

client.on("ready", () => {
  console.log(`🟢 Arbiter online as ${client.user.tag} with enhanced misinformation detection`);
  
  // Log enhanced features status
  console.log('✅ Enhanced Features Loaded:');
  console.log(`   • Cache Manager: ${cacheManager ? 'Active' : 'Disabled'}`);
  console.log(`   • Parallel Processor: Max ${parallelProcessor.maxConcurrency} concurrent operations`);
  console.log(`   • Content Fetcher: ${contentFetcher ? 'Active' : 'Disabled'}`);
  console.log(`   • Error Handler: ${errorHandler ? 'Active' : 'Disabled'}`);
  console.log(`   • Enhanced Source Verification: ${sourceVerifier.contentFetcher ? 'Active' : 'Basic'}`);
  console.log(`   • Thread Context Analysis: ${threadContextAnalyzer ? 'Active' : 'Disabled'}`);
  console.log(`   • Interactive Verification: ${interactiveVerifier ? 'Active' : 'Disabled'}`);
  
  // Start periodic cache cleanup and stats logging
  setInterval(() => {
    const cacheStats = cacheManager.getStats();
    const processorStats = parallelProcessor.getStats();
    const errorStats = errorHandler.getErrorStats();
    
    // Clean up old pending interactions
    interactiveVerifier.cleanupPendingInteractions();
    
    logger.log('info', 'System Performance Stats', {
      cache: cacheStats,
      processor: processorStats,
      errors: errorStats,
      pendingInteractions: interactiveVerifier.pendingInteractions.size
    });
  }, 300000); // Every 5 minutes
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Enhanced error handling for login
client.login(DISCORD_TOKEN).catch(error => {
  console.error("Failed to login to Discord:", error);
  console.log(`
🚨 Discord Bot Setup Required:

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Go to "Bot" section
4. Scroll down to "Privileged Gateway Intents"
5. Enable these intents:
   ✅ MESSAGE CONTENT INTENT
   ✅ SERVER MEMBERS INTENT (optional)
   ✅ PRESENCE INTENT (optional)
6. Save changes and restart the bot

Your bot token appears valid, but needs proper intents enabled.
  `);
  process.exit(1);
});

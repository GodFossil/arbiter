require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType, MessageFlags } = require("discord.js");
const { aiUserFacing, aiSummarization } = require("./ai");
const { getSpecificPrinciple } = require("./logic");
const { isOtherBotCommand, isTrivialOrSafeMessage } = require("./filters");
const {
  saveUserMessage,
  saveBotReply,
  fetchUserHistory,
  fetchChannelHistory,
  getCacheStatus,
  performCacheCleanup,
  resetAllData
} = require("./storage");
const { 
  initializeAIUtils, 
  exaAnswer, 
  exaSearch, 
  cleanUrl,
  getCircuitBreakers,
  getRateLimiters
} = require("./ai-utils");
const { detectContradictionOrMisinformation, MAX_FACTCHECK_CHARS } = require("./detection");
const app = express();

const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Arbiter - OK'));
app.listen(PORT, () => console.log(`Keepalive server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
    Partials.ThreadMember
  ]
});

const ALLOWED_CHANNELS = process.env.ALLOWED_CHANNELS
  ? process.env.ALLOWED_CHANNELS.split(',').map(s => s.trim()).filter(Boolean)
  : [];
function isBotActiveInChannel(msg) {
  const parentId = msg.channel.parentId;
  if (ALLOWED_CHANNELS.length === 0) return true;
  if (ALLOWED_CHANNELS.includes(msg.channel.id)) return true;
  if (parentId && ALLOWED_CHANNELS.includes(parentId)) return true;
  return false;
}



// These constants are now defined in their respective modules

// ---- PERSONALITY INJECTION ----
const SYSTEM_INSTRUCTIONS = `
You are the invaluable assistant of our Discord debate server. The server is called The Debate Server and it is a community full of brilliant interlocutors. You are to assist us by providing logical analyses and insights. You are to prioritize truth over appeasing others. You will hold no reservations in declaring a user valid or incorrect, provided that you determine either to be the case to the best of your ability. Your personality is calm, direct, bold, stoic, and wise. You are a master of mindfulness and all things philosophy. You are humble. You will answer prompts succinctly, directly, and in as few words as necessary. You will know that brevity is the soul of wit and wisdom. Your name is Arbiter, you may refer to yourself as The Arbiter.
- Avoid generic or diplomatic statements. If the facts or arguments warrant a judgment or correction, state it directly. Use decisive, unambiguous language whenever you issue an opinion or summary.
- Never apologize on behalf of others or yourself unless a factual error was made and corrected.
- If there is true ambiguity, say "uncertain," "no clear winner," or "evidence not provided"—NOT "it depends" or "both sides have a point."
- Default tone is realistic and direct, not conciliatory.
- Never use language principally for placation, comfort, or encouragement. Use language for accuracy, and also quips.
`.trim();

// ---- UTILITIES ----
async function replyWithSourcesButton(msg, replyOptions, sources, sourceMap) {
  // Generate a unique ID for this button interaction
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  
  const replyMsg = await msg.reply({
    ...replyOptions,
    components: [makeSourcesButton(sources, uniqueId)]
  });
  
  // Map both the unique ID and the Discord message ID to the sources
  sourceMap.set(uniqueId, { urls: sources, timestamp: Date.now() });
  sourceMap.set(replyMsg.id, { urls: sources, timestamp: Date.now() });
  
  return replyMsg;
}
// cleanUrl is now imported from ai-utils.js

function truncateMessage(content, maxLength = 1950) {
  if (!content || content.length <= maxLength) return content;
  
  // Try to truncate at word boundary
  const truncated = content.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > maxLength * 0.8 ? lastSpace : maxLength;
  
  return content.slice(0, cutPoint) + '... [truncated]';
}





// Button logic  
const SOURCE_BUTTON_ID = "arbiter-show-sources";

function makeSourcesButton(sourceArray, msgId) {
  return new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setCustomId(`${SOURCE_BUTTON_ID}:${msgId}`)
      .setLabel('\u{1D48A}')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!sourceArray || sourceArray.length === 0)
  ]);
}

function makeJumpButton(jumpUrl) {
  return new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setURL(jumpUrl)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔗')
  ]);
}

let latestSourcesByBotMsg = new Map(); // msgId -> { urls, timestamp }

setInterval(async () => {
  const cutoff = Date.now() - 3600 * 1000; // 1 hour cutoff
  const expiredEntries = [];
  
  // Clean up source button mappings
  for (const [id, obj] of latestSourcesByBotMsg.entries()) {
    if (obj.timestamp < cutoff) {
      expiredEntries.push(id);
    }
  }
  
  // Disable buttons for expired Discord message IDs (not unique button IDs)
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
              // Message not in this channel, continue searching
              continue;
            }
          }
        }
        
        if (foundMessage && foundMessage.components && foundMessage.components.length > 0) {
          // Remove the button completely by setting components to empty array
          await foundMessage.edit({ components: [] });
        }
      } catch (e) {
        // Message might be deleted or bot lacks permissions - silently continue
        console.warn(`Failed to disable button for message ${id}:`, e.message);
      }
    }
    
    // Remove from map regardless of button disable success
    latestSourcesByBotMsg.delete(id);
  }
  
  // LRU cache is self-managing, no TTL cleanup needed
  
  // Perform storage cache cleanup
  performCacheCleanup();
  
  console.log(`[DEBUG] Cache cleanup: sources=${latestSourcesByBotMsg.size}, storage caches cleaned via storage module`);
}, 5 * 60 * 1000); // Run every 5 minutes instead of 10



// ---- ADMIN: FULL RESET ----
async function handleAdminCommands(msg) {
  console.log(`[DEBUG] Admin command check: "${msg.content}" from user ${msg.author.id}`);
  
  if (!msg.guild) {
    console.log("[DEBUG] No guild found - not a server message");
    return false;
  }
  
  const ownerId = msg.guild.ownerId || (await msg.guild.fetchOwner()).id;
  console.log(`[DEBUG] Guild owner: ${ownerId}, Message author: ${msg.author.id}`);
  
  if (msg.author.id !== ownerId) {
    console.log("[DEBUG] User is not guild owner - admin command denied");
    return false;
  }
  
  if (msg.content === "!arbiter_reset_all") {
    console.log("[DEBUG] Reset command matched - executing database reset");
    try {
      // Completely reset the database structure and all storage caches
      await resetAllData();
      
      // Clear remaining local caches
      latestSourcesByBotMsg.clear();
      
      console.log("[ADMIN] Complete database and memory reset performed by guild owner");
      await msg.reply("🗑️ **COMPLETE SYSTEM RESET PERFORMED**\n\n• MongoDB database completely dropped and recreated\n• All collections, indexes, and artifacts removed\n• Fresh database structure initialized\n• All in-memory caches cleared\n• Arbiter reset to pristine state");
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to reset database structure.", e);
      await msg.reply("The void resists complete reformation. Database structure may be partially reset.");
      return true;
    }
  }
  if (msg.content.startsWith("!arbiter_analyze ")) {
    try {
      const textToAnalyze = msg.content.replace("!arbiter_analyze ", "").trim();
      const analysis = analyzeLogicalContent(textToAnalyze);
      await msg.reply(
        `🧠 **Logical Analysis**\n` +
        `**Content:** "${textToAnalyze}"\n\n` +
        `**Analysis:**\n` +
        `• Uncertainty markers: ${analysis.hasUncertainty ? '✅' : '❌'}\n` +
        `• Temporal qualifiers: ${analysis.hasTemporal ? '✅' : '❌'}\n` +
        `• Absolute claims: ${analysis.hasAbsolutes ? '✅' : '❌'}\n` +
        `• Evidence indicators: ${analysis.hasEvidence ? '✅' : '❌'}\n` +
        `• Substantiveness score: ${analysis.substantiveness.toFixed(2)}\n\n` +
        (analysis.recommendations.length > 0 ? 
          `**Recommendations:**\n${analysis.recommendations.map(r => `• ${r}`).join('\n')}` : 
          `**No specific recommendations**`)
      );
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to analyze content.", e);
      await msg.reply("Analysis proves elusive.");
      return true;
    }
  }
  if (msg.content.startsWith("!arbiter_principle ")) {
    try {
      const principleName = msg.content.replace("!arbiter_principle ", "").trim();
      const principle = getSpecificPrinciple(principleName);
      
      if (!principle) {
        await msg.reply(`📚 **Available Principles:**\nnonContradiction, excludedMiddle, identity\n\nUsage: \`!arbiter_principle nonContradiction\``);
        return true;
      }
      
      await msg.reply(
        `📜 **${principle.name}**\n\n` +
        `**Principle:** ${principle.principle}\n\n` +
        `**Application:** ${principle.application}\n\n` +
        `**Examples:**\n${principle.examples.map(ex => `• ${ex}`).join('\n')}`
      );
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to get principle.", e);
      await msg.reply("Wisdom remains hidden.");
      return true;
    }
  }
  
  if (msg.content === "!arbiter_status") {
    try {
      const { aiCircuitBreaker, exaCircuitBreaker } = getCircuitBreakers();
      const aiStatus = aiCircuitBreaker.getStatus();
      const exaStatus = exaCircuitBreaker.getStatus();
      const storageCacheStatus = getCacheStatus();
      
      await msg.reply(
        `⚡ **SYSTEM STATUS** ⚡\n\n` +
        `**DigitalOcean AI Circuit Breaker:**\n` +
        `• State: ${aiStatus.state}\n` +
        `• Failures: ${aiStatus.failureCount}\n` +
        `• Last Failure: ${aiStatus.lastFailureTime ? new Date(aiStatus.lastFailureTime).toLocaleString() : 'None'}\n\n` +
        `**Exa API Circuit Breaker:**\n` +
        `• State: ${exaStatus.state}\n` +
        `• Failures: ${exaStatus.failureCount}\n` +
        `• Last Failure: ${exaStatus.lastFailureTime ? new Date(exaStatus.lastFailureTime).toLocaleString() : 'None'}\n\n` +
        `**Cache Status:**\n` +
        `• Message Cache: ${storageCacheStatus.messageCache} entries\n` +
        `• Analysis Cache: ${storageCacheStatus.contentAnalysisCache} entries\n` +
        `• Validation Cache: ${storageCacheStatus.contradictionValidationCache} entries`
      );
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to get system status.", e);
      await msg.reply("Status inquiry proves elusive.");
      return true;
    }
  }

  return false;
}

// AI utility functions are now imported from ai-utils.js

// ------ DISCORD BOT EVENT HANDLER ------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`[DEBUG] Bot ready. Required env vars check:`);
  console.log(`- DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? 'SET' : 'MISSING'}`);
  console.log(`- DO_AI_API_KEY: ${process.env.DO_AI_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`- MONGODB_URI: ${process.env.MONGODB_URI ? 'SET' : 'MISSING'}`);
  console.log(`- EXA_API_KEY: ${process.env.EXA_API_KEY ? 'SET' : 'MISSING'}`);
  
  // Initialize AI utilities (rate limiting and circuit breakers)
  try {
    await initializeAIUtils();
  } catch (error) {
    console.error("[ERROR] Failed to initialize AI utilities:", error);
    process.exit(1);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.MessageComponent) return;
  
  // Handle source buttons
  if (interaction.customId.startsWith(SOURCE_BUTTON_ID)) {
    const buttonId = interaction.customId.split(':')[1];
    let sources = latestSourcesByBotMsg.get(buttonId) || latestSourcesByBotMsg.get(interaction.message.id);

    if (!sources) {
      await interaction.reply({ content: "No source information found for this message.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!sources.urls || !sources.urls.length) {
      await interaction.reply({ content: "No URLs were referenced in this response.", flags: MessageFlags.Ephemeral });
      return;
    }
    const resp = `**Sources referenced:**\n` + sources.urls.map(u => `<${u}>`).join('\n');
    await interaction.reply({ content: resp, flags: MessageFlags.Ephemeral });
    return;
  }
  

});

client.on("messageCreate", async (msg) => {
  // Filter for allowed channel types and whitelisted channels (text, thread, forum)
  if (
    msg.author.bot ||
    !(
      msg.channel.type === ChannelType.GuildText ||
      msg.channel.type === ChannelType.PublicThread ||
      msg.channel.type === ChannelType.PrivateThread ||
      msg.channel.type === ChannelType.AnnouncementThread ||
      msg.channel.type === ChannelType.GuildForum
    ) ||
    !isBotActiveInChannel(msg)
  ) return;

  // Handle admin commands FIRST (before any filtering)
  const handled = await handleAdminCommands(msg);
  if (handled) return;

  // Ignore trivial content or known other bot commands
  if (isOtherBotCommand(msg.content) || isTrivialOrSafeMessage(msg.content)) return;

    // Store the message!
  let thisMsgId = null;
  try {
    thisMsgId = await saveUserMessage(msg, aiSummarization, SYSTEM_INSTRUCTIONS);
  } catch (e) {
    console.warn("DB store/prune error:", e);
  }

  const isMentioned = msg.mentions.has(client.user);
  let isReplyToBot = false;
  let repliedToMsg = null;
  if (msg.reference && msg.reference.messageId) {
    try {
      repliedToMsg = await msg.channel.messages.fetch(msg.reference.messageId);
      if (repliedToMsg.author.id === client.user.id) {
        isReplyToBot = true;
      }
    } catch (e) {
      repliedToMsg = null;
      console.warn("Failed to fetch replied-to message:", e);
    }
  }

  // ============ BACKGROUND DETECTION =============
  // Intelligent pre-filtering to avoid unnecessary API calls
  const shouldRunDetection = msg.content.length <= MAX_FACTCHECK_CHARS && 
    !isTrivialOrSafeMessage(msg.content) && 
    !isOtherBotCommand(msg.content) &&
    msg.content.length > 8; // Minimum substantive length
  
  if (shouldRunDetection) {
    console.log(`[DEBUG] Running background detection for: "${msg.content}"`);
    (async () => {
      let detection = null;
      try {
        detection = await detectContradictionOrMisinformation(msg);
        console.log(`[DEBUG] Detection result:`, detection);
      } catch (e) {
        console.warn("Detection failure (silent to user):", e);
      }
      if (detection) {
        const hasContradiction = detection.contradiction && detection.contradiction.contradiction === "yes";
        const hasMisinformation = detection.misinformation && detection.misinformation.misinformation === "yes";
        
        // Handle combined detection or individual detection
        if (hasContradiction && hasMisinformation) {
          // BOTH detected - combine into single message
          const combinedReply = 
            `⚡🚩 **CONTRADICTION & MISINFORMATION DETECTED** 🚩⚡\n\n` +
            `**CONTRADICTION FOUND:**\n` +
            `-# \`\`\`${detection.contradiction.evidence}\`\`\`\n` +
            `-# \`\`\`${detection.contradiction.contradicting || msg.content}\`\`\`\n` +
            `${detection.contradiction.reason}\n\n` +
            `**MISINFORMATION FOUND:**\n` +
            `**False claim:** ${msg.content}\n` +
            `**Why false:** ${detection.misinformation.reason}\n` +
            (detection.misinformation.evidence ? `**Fact-check evidence:** ${detection.misinformation.evidence}` : "");
          
          const evidenceUrl = detection.contradiction.url || "";
          const misinfoUrl = detection.misinformation.url || "";
          const allSources = [misinfoUrl].filter(Boolean);
          
          if (evidenceUrl && allSources.length > 0) {
            // Both jump button and sources button  
            const combinedId = `${Date.now()}-combined`;
            // Create combined button row (side-by-side)
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
            latestSourcesByBotMsg.set(combinedId, { urls: allSources, timestamp: Date.now() });
            latestSourcesByBotMsg.set(replyMsg.id, { urls: allSources, timestamp: Date.now() });
          } else if (evidenceUrl) {
            // Just jump button
            await msg.reply({
              content: truncateMessage(combinedReply),
              components: [makeJumpButton(evidenceUrl)]
            });
          } else if (allSources.length > 0) {
            // Just sources button
            await replyWithSourcesButton(msg, { content: truncateMessage(combinedReply) }, allSources, latestSourcesByBotMsg);
          } else {
            // No buttons
            await msg.reply(truncateMessage(combinedReply));
          }
          
        } else if (hasContradiction) {
          // CONTRADICTION ONLY
          const contradictionReply = 
            `⚡ **CONTRADICTION DETECTED** ⚡️\n\n` +
            `-# \`\`\`${detection.contradiction.evidence}\`\`\`\n` +
            `-# \`\`\`${detection.contradiction.contradicting || msg.content}\`\`\`\n\n` +
            `${detection.contradiction.reason}`;
          
          const evidenceUrl = detection.contradiction.url || "";
          
          if (evidenceUrl) {
            await msg.reply({
              content: truncateMessage(contradictionReply),
              components: [makeJumpButton(evidenceUrl)]
            });
          } else {
            await msg.reply(truncateMessage(contradictionReply));
          }
          
        } else if (hasMisinformation) {
          // MISINFORMATION ONLY  
          const misinfoReply = 
            `🚩 **MISINFORMATION DETECTED** 🚩\n` +
            `Reason: ${detection.misinformation.reason}\n` +
            (detection.misinformation.evidence ? `Evidence: ${detection.misinformation.evidence}` : "");
          
          const sourcesForButton = detection.misinformation.url ? [detection.misinformation.url] : [];
          
          if (sourcesForButton.length > 0) {
            await replyWithSourcesButton(msg, { content: truncateMessage(misinfoReply) }, sourcesForButton, latestSourcesByBotMsg);
          } else {
            await msg.reply(truncateMessage(misinfoReply));
          }
        }
      }
    })();
  }

  // ---- USER-FACING REPLIES ----
  if (isMentioned || isReplyToBot) {
    console.log(`[DEBUG] Bot mentioned or replied to. Processing reply...`);
  try {
    await msg.channel.sendTyping();
    let userHistoryArr = null, channelHistoryArr = null;
    try {
      userHistoryArr = await fetchUserHistory(
        msg.author.id, msg.channel.id, msg.guildId, 10, thisMsgId
      );
    } catch (e) {
      userHistoryArr = null;
      try { await msg.reply("The past refuses to reveal itself."); } catch {}
    }
    try {
      channelHistoryArr = await fetchChannelHistory(
        msg.channel.id, msg.guildId, 15, thisMsgId
      );
    } catch (e) {
      channelHistoryArr = null;
      try { await msg.reply("All context is lost to the ether."); } catch {}
    }
    if (!userHistoryArr || !channelHistoryArr) {
      try {
        await msg.reply("Not enough message history available for a quality reply. Truth sleeps.");
      } catch {}
      return;
    }

    const allHistContent = [
      ...userHistoryArr.map(m => m.content),
      ...channelHistoryArr.map(m => m.content)
    ];
    const trivialCount = allHistContent.filter(isTrivialOrSafeMessage).length;
    const totalCount = allHistContent.length;
    if (totalCount > 0 && (trivialCount / totalCount) > 0.8) {
      try {
        await msg.reply("Little of substance has been spoken here so far.");
      } catch {}
      return;
    }
    function botName() {
      return Math.random() < 0.33 ? "Arbiter" : (Math.random() < 0.5 ? "The Arbiter" : "Arbiter");
    }
    const userHistory = userHistoryArr.map(m => `You: ${m.content}`).reverse().join("\n");
    const channelHistory = channelHistoryArr.map(m => {
      if (m.type === "summary") return `[SUMMARY] ${m.summary}`;
      if (m.user === msg.author.id) return `${m.displayName || m.username}: ${m.content}`;
      if (m.user === client.user.id) return `${botName()}: ${m.content}`;
      return `${m.displayName || m.username || "User"}: ${m.content}`;
    }).join("\n");
    const dateString = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // ---- NEWS SECTION: Exa /search ----
    let newsSection = "";
    let sourcesUsed = [];
    try {
      const newsRegex = /\b(news|headline|latest|article|current event|today)\b/i;
      if (newsRegex.test(msg.content)) {
        let topic = "world events";
        const match = msg.content.match(/news (about|on|regarding) (.+)$/i);
        if (match) topic = match[2];
        const results = await exaSearch(`latest news about ${topic}`, 5);
        // Inside your // ---- NEWS SECTION ---- block
        if (results && results.length) {
          newsSection = (`Here are real-time news headlines for "${topic}":\n` +
          results.map(r =>
            `• [${r.title}](${r.url})\n  ${r.text ? r.text.slice(0, 200) : ''}`
          ).join("\n"));
          sourcesUsed = results.map(r => cleanUrl(r.url)).filter(Boolean); // <-- ADD cleanUrl()
        } else {
          newsSection = "No up-to-date news articles found for that topic.";
        }
      }
    } catch (e) {
      newsSection = `News search failed: \`${e.message}\``;
    }
    // If this is a reply to a message (user or bot), treat it as the subject in the context
    let referencedSection = "";
    if (repliedToMsg) {
      referencedSection =
        `[referenced message]\nFrom: ${
          repliedToMsg.member ? repliedToMsg.member.displayName : repliedToMsg.author.username
        } (${repliedToMsg.author.username})\n${repliedToMsg.content}\n`;
    }
    
          const prompt = `
${SYSTEM_INSTRUCTIONS}

${USE_LOGICAL_PRINCIPLES ? getLogicalContext('general') : ''}

Today is ${dateString}.
Reply concisely. Use recent context from user (by display name/nickname if available), me ("Arbiter" or "The Arbiter"), and others below. Include [SUMMARY]s if requested or contextually necessary. If [news] is present, focus on those results.${USE_LOGICAL_PRINCIPLES ? ' Apply the logical principles above to enhance your reasoning and maintain consistency.' : ''}${referencedSection ? ` If [referenced message] is present, treat it as the main subject of the user's message.
- Do not use ambiguous hedging or "on the one hand/on the other hand" language unless it is genuinely necessary.
- Favor declarative, direct statements. When a position is unsupported, say so clearly and confidently.
- Avoid generic phrases such as "It is important to note...", "It depends...", or "While both sides...".
- Never conclude that "both sides have a point" if one side's claim is demonstrably weaker or unsupported.
- Do not default to proposing compromise unless the evidence is genuinely balanced.
- If you must indicate ambiguity, specify the best-supported or most-reasonable argument, do not equate unequal substantiations.` : ""}
[user history]
${userHistory}
[channel context]
${channelHistory}
${newsSection ? `[news]\n${newsSection}` : ""}
${referencedSection}
[user message]
"${msg.content}"
[reply]
`;

    let replyText;
    try {
      const { userFacingLimit } = getRateLimiters();
      const { aiCircuitBreaker } = getCircuitBreakers();
      
      if (!userFacingLimit) {
        console.warn("[RATE LIMIT] Rate limiting not initialized, executing directly");
        const { result } = await aiCircuitBreaker.execute(async () => {
          return aiUserFacing(prompt);
        });
        replyText = result;
      } else {
        console.log(`[RATE LIMIT] UserFacing AI queued (${userFacingLimit.pendingCount} pending, ${userFacingLimit.activeCount} active)`);
        const { result } = await userFacingLimit(() => {
          return aiCircuitBreaker.execute(async () => {
            console.log("[RATE LIMIT] UserFacing AI executing");
            return aiUserFacing(prompt);
          });
        });
        replyText = result;
      }
    } catch (e) {
      replyText = "The Arbiter chooses silence.";
      console.warn("AI user-facing error:", e);
    }

    // ==== Source-gathering logic for non-news answers ====
    if (sourcesUsed.length === 0) {
      try {
        // Assume exaAnswer returns { answer, urls }:
        let exaRes = await exaAnswer(msg.content);
        if (exaRes && exaRes.urls && exaRes.urls.length) sourcesUsed = exaRes.urls;
      } catch (e) {}
    }

    // ---- Send reply, platform source button if URLs exist ----
    console.log('[DEBUG] sourcesUsed:', sourcesUsed);
try {
  const filteredSources = [...new Set(sourcesUsed
    .map(u => cleanUrl(u))
    .filter(u => typeof u === "string" && u.startsWith("http")))];
  if (filteredSources.length > 0) {
    await replyWithSourcesButton(msg, { content: truncateMessage(replyText) }, filteredSources, latestSourcesByBotMsg);
  } else {
    await msg.reply(truncateMessage(replyText));
  }
} catch (e) {
  console.error("Discord reply failed:", e);
}

    // ---- Log bot reply to Mongo ----
    await saveBotReply(msg, truncateMessage(replyText), client.user);

  } catch (err) {
    try {
      await msg.reply("Nobody will help you.");
    } catch {}
    console.error("AI user-facing failed:", err);
    }
}});
client.login(process.env.DISCORD_TOKEN);
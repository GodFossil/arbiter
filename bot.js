require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType, MessageFlags } = require("discord.js");
const { connect } = require("./mongo");
const { aiUserFacing, aiBackground, aiSummarization, aiFactCheck } = require("./ai");
const axios = require("axios");
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

// ====== BOT COMMANDS TO IGNORE FROM OTHER BOTS ======
const KNOWN_BOT_COMMANDS = [
  "!purge", "!silence", "!user", "!cleanrapsheet", "!rapsheet",
  "!charge", "!cite", "!book", "!editdailytopic", "<@&13405551155400003624>",
  "!boot", "!!!", "!editRapSheet", "!ban", "!editDemographics", "!selection",
  "$selection", "<@&1333261940235047005>", "<@&1333490526296477716>", "<@&1328638724778627094>",
  "<@&1333264620869128254>", "<@&1333223047385059470>", "<@&1333222016710611036>", "<@&1334073571638644760>",
  "<@&1335152063067324478>", "<@&1336979693844434987>", "<@&1340140409732468866>", "<@&1317770083375775764>",
  "<@&1317766628569518112>", "<@&1392325053432987689>", "!define", "&poll", "$demographics", "Surah",
  "!surah", "<@&1334820484440657941>", "!mimic", "$!", "!$", "$$", "<@&1399605580502405120>", "!arraign",
  "!trialReset", "!release", "!mark", "!flag", "/endthread", ".newPollButton", "!webhook", "!goTrigger", "!&",
  "!eval", "!chart", "&test", "++" // Add others here as needed
];
function isTrivialOrSafeMessage(content) {
  if (!content || typeof content !== "string") return true;
  const safe = [
    "hello", "hi", "hey", "ok", "okay", "yes", "no", "lol", "sure", "cool", "nice", "thanks",
    "thank you", "hey arbiter", "sup", "idk", "good morning", "good night"
  ];
  const onlyEmoji = /^[\W_]+$/u;
  const trimmed = content.trim().toLowerCase();
  return (
    safe.includes(trimmed)
    || onlyEmoji.test(content)
    || trimmed.length < 4
  );
}
function isOtherBotCommand(content) {
  if (!content) return false;
  return KNOWN_BOT_COMMANDS.some(cmd =>
    content.trim().toLowerCase().startsWith(cmd)
  );
}

// ---- TUNEABLE PARAMETERS ----
const historyCache = { user: new Map(), channel: new Map() };
const HISTORY_TTL_MS = 4000;
const MAX_CONTEXT_MESSAGES_PER_CHANNEL = 100;
const SUMMARY_BLOCK_SIZE = 20;
const MAX_FACTCHECK_CHARS = 500;
const TRIVIAL_HISTORY_THRESHOLD = 0.8; // 80% trivial = skip context LLM

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
async function replyWithSourcesButton(msg, replyOptions, sources, sourceMap) {
  // Generate a unique ID for this button interaction
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const replyMsg = await msg.reply({
    ...replyOptions,
    components: [makeSourcesButton(sources, uniqueId)]
  });
  
  // Map both the unique ID and the Discord message ID to the sources
  sourceMap.set(uniqueId, { urls: sources, timestamp: Date.now() });
  sourceMap.set(replyMsg.id, { urls: sources, timestamp: Date.now() });
  
  return replyMsg;
}
function cleanUrl(url) {
  return url.trim().replace(/[)\].,;:!?]+$/g, '');
}

// ---- HISTORY UTILS ----
async function fetchUserHistory(userId, channelId, guildId, limit = 7, excludeMsgId = null) {
  const key = `${userId}:${channelId}:${guildId}:${limit}:${excludeMsgId || ""}`;
  const now = Date.now();
  const cached = historyCache.user.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) return cached.data;
  const db = await connect();
  const query = { type: "message", user: userId, channel: channelId, guildId };
  if (excludeMsgId) query._id = { $ne: excludeMsgId };
  const data = await db.collection("messages")
    .find(query)
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
  historyCache.user.set(key, { time: now, data });
  return data;
}
async function fetchChannelHistory(channelId, guildId, limit = 7, excludeMsgId = null) {
  const key = `${channelId}:${guildId}:${limit}:${excludeMsgId || ""}`;
  const now = Date.now();
  const cached = historyCache.channel.get(key);
  if (cached && (now - cached.time < HISTORY_TTL_MS)) return cached.data;
  const db = await connect();
  const [full, summaries] = await Promise.all([
    db.collection("messages")
      .find({ type: "message", channel: channelId, guildId, content: { $exists: true }, ...(excludeMsgId && { _id: { $ne: excludeMsgId } }) })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray(),
    db.collection("messages")
      .find({ type: "summary", channel: channelId, guildId })
      .sort({ ts: -1 })
      .limit(3)
      .toArray()
  ]);
  const result = [...summaries.reverse(), ...full.reverse()];
  historyCache.channel.set(key, { time: now, data: result });
  return result;
}

// Source button logic
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

let latestSourcesByBotMsg = new Map(); // msgId -> { urls, timestamp }

setInterval(async () => {
  // Clean up after 1 hour
  const cutoff = Date.now() - 3600 * 1000;
  const expiredEntries = [];
  
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
}, 10 * 60 * 1000);

// ---- MEMORY SAVE WITH META ----
async function saveUserMessage(msg) {
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
        const { result } = await aiSummarization(summaryPrompt);
        summary = result;
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

// ---- ADMIN: FULL RESET ----
async function handleAdminCommands(msg) {
  if (!msg.guild) return false;
  const ownerId = msg.guild.ownerId || (await msg.guild.fetchOwner()).id;
  if (msg.author.id !== ownerId) return false;
  if (msg.content === "!arbiter_reset_all") {
    try {
      const db = await connect();
      await db.collection("messages").deleteMany({});
      await msg.reply("All memory erased. Arbiter reset to blank slate.");
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to erase all memory.", e);
      await msg.reply("The void resists being emptied.");
      return true;
    }
  }
  return false;
}

// ---- EXA FACT CHECK AND NEWS HELPERS ----
const EXA_API_KEY = process.env.EXA_API_KEY;
async function exaAnswer(query) {
  try {
    const res = await axios.post(
      "https://api.exa.ai/answer",
      { query, type: "neural" },
      { headers: { Authorization: `Bearer ${EXA_API_KEY}` } }
    );
    let urls = [];
    if (res.data?.urls) {
      urls = Array.isArray(res.data.urls) ? res.data.urls : [res.data.urls];
      urls = urls.map(u => cleanUrl(u));
    }
    if ((!urls.length) && typeof res.data.answer === "string") {
      const re = /(https?:\/\/[^\s<>"'`]+)/g;
      urls = Array.from(res.data.answer.matchAll(re), m => cleanUrl(m[1]));
    }
    return { answer: res.data.answer || "", urls: urls };
  } catch (err) {
    console.warn("Exa /answer failed:", err.message);
    return { answer: "", urls: [] };
  }
}

async function exaSearch(query, numResults = 5) {
  try {
    const res = await axios.post(
      "https://api.exa.ai/search",
      { query, numResults },
      { headers: { Authorization: `Bearer ${EXA_API_KEY}` } }
    );
    return Array.isArray(res.data.results) ? res.data.results : [];
  } catch (err) {
    console.warn("Exa /search failed:", err.message);
    return [];
  }
}

// ---- AI UTILS ----
async function aiFlash(prompt) {
  return await aiBackground(prompt);
}
async function aiFactCheckFlash(prompt) {
  return await aiFactCheck(prompt);
}

// ---- DETECTION LOGIC ----
async function detectContradictionOrMisinformation(msg) {
  let contradiction = null;
  let contradictionEvidenceUrl = "";
  let misinformation = null;

  console.log(`[DEBUG] Starting detection for: "${msg.content}"`);
  
  // Trivial message & other bot command skip for contradiction/misinformation:
  const isTrivial = isTrivialOrSafeMessage(msg.content);
  const isBotCommand = isOtherBotCommand(msg.content);
  console.log(`[DEBUG] Message filters - Trivial: ${isTrivial}, Bot Command: ${isBotCommand}`);
  
  if (isTrivial || isBotCommand) {
    console.log(`[DEBUG] Skipping detection - message filtered out`);
    return { contradiction: null, misinformation: null };
  }

  const db = await connect();
  const userMessages = await db.collection("messages")
    .find({
      type: "message",
      user: msg.author.id,
      channel: msg.channel.id,
      guildId: msg.guildId,
      _id: { $ne: msg.id }
    })
    .sort({ ts: -1 })
    .limit(20)
    .toArray();

  const priorSubstantive = userMessages.filter(m => !isTrivialOrSafeMessage(m.content));
  
  // Duplicate detection: skip contradiction check for duplicates, but still check misinformation
  const isDuplicate = priorSubstantive.length && priorSubstantive[0].content.trim() === msg.content.trim();
  if (isDuplicate) {
    console.log(`[DEBUG] Duplicate message detected - skipping contradiction check but proceeding with misinformation check`);
  }
  
  console.log(`[DEBUG] Passed all filters, proceeding with detection logic`);
  console.log(`[DEBUG] Prior substantive messages: ${priorSubstantive.length}`);

  // ---- CONTRADICTION CHECK ----
  if (priorSubstantive.length > 0 && !isDuplicate) {
    const concatenated = priorSubstantive
      .map(m =>
        m.content.length > MAX_FACTCHECK_CHARS
          ? m.content.slice(0, MAX_FACTCHECK_CHARS)
          : m.content
      )
      .reverse()
      .join("\n");
    const mainContent =
      msg.content.length > MAX_FACTCHECK_CHARS
        ? msg.content.slice(0, MAX_FACTCHECK_CHARS)
        : msg.content;
    const contradictionPrompt = `
${SYSTEM_INSTRUCTIONS}
You are a careful contradiction detector for debate analysis.
Does the [New message] directly contradict any of the [Previous statements] sent by **this exact same user** below?
Always reply in strict JSON of the form:
{"contradiction":"yes"|"no", "reason":"...", "evidence":"...", "url":"..."}
- "contradiction": Use "yes" if the new message is logically or factually incompatible with a prior message sent by this user; otherwise use "no".
- "reason": For "yes", concisely explain how the contents of the new message and that of any prior message(s) are contradictory. Do not mention the user, do not narrate ("user said..."), and do not say "these statements conflict." Instead, simply state the essence of the contradiction, e.g., "Spheres are not flat," or "Vaccines either cause autism or they do not cause autism," or "There are no married bachelors." For "no", use an empty string.
- "evidence": For "yes", provide the quoted contents of the user's prior message that contains the contradictory statement. For "no", use an empty string.
- "url": For "yes", include a direct Discord link to the contradictory message (format: https://discord.com/channels/<server_id>/<channel_id>/<message_id>). For "no", use an empty string.
In all cases, never reply with non-JSON or leave any field out. If you do not find a contradiction, respond "contradiction":"no".
[Previous statements]
${concatenated}
[New message]
${mainContent}
`.trim();
    try {
      const { result } = await aiFlash(contradictionPrompt);
      let parsed = null;
      try {
        const match = result.match(/\{[\s\S]*?\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch {}
      if (parsed && parsed.contradiction === "yes") {
        // Find and link the matching prior message by content.
        const evidenceMsg = priorSubstantive.find(
          m =>
            parsed.evidence &&
            m.content.trim() === parsed.evidence.trim()
        );
        contradictionEvidenceUrl =
          evidenceMsg && evidenceMsg.discordMessageId
            ? `https://discord.com/channels/${evidenceMsg.guildId}/${evidenceMsg.channel}/${evidenceMsg.discordMessageId}`
            : "";
        parsed.url = contradictionEvidenceUrl;
        contradiction = parsed;
      }
    } catch (e) {
      console.warn("Contradiction detection error:", e);
    }
  }
  
  // ---- MISINFORMATION CHECK ----
  console.log(`[DEBUG] Contradiction result: ${contradiction ? 'FOUND' : 'NONE'}, proceeding to misinformation check`);
  if (!contradiction) {
    const mainContent =
      msg.content.length > MAX_FACTCHECK_CHARS
        ? msg.content.slice(0, MAX_FACTCHECK_CHARS)
        : msg.content;
    const answer = await exaAnswer(mainContent);
    console.log(`[DEBUG] Exa answer for "${mainContent}":`, answer);

    // Do not check LLM if Exa answer is missing/empty/meaningless
    if (!answer || answer.answer.trim() === "" || /no relevant results|no results/i.test(answer.answer)) {
      console.log(`[DEBUG] Skipping LLM check - Exa returned no useful context`);
      return { contradiction, misinformation: null };
    }

    const misinfoPrompt = `
${SYSTEM_INSTRUCTIONS}
You are a fact-checking assistant focused on identifying CRITICAL misinformation that could cause harm.
Does the [User message] contain dangerous misinformation according to the [Web context]?
Always reply in strict JSON of the form:
{"misinformation":"yes"|"no", "reason":"...", "evidence":"...", "url":"..."}
- "misinformation": Use "yes" ONLY if the user's message contains CRITICAL misinformation that is:
  * Medically dangerous (false health/vaccine claims, dangerous treatments)
  * Scientifically harmful (flat earth, climate denial with policy implications)
  * Falsified conspiratorial claims that can be definitively debunked with evidence (e.g. claims about public figures that contradict documented facts)
  * Deliberately deceptive with serious consequences
  Use "no" for contested/debated claims (even if you disagree), minor inaccuracies, nuanced disagreements, opinions, jokes, non-harmful misconceptions, or unfalsified conspiracy theories. The claim must be DEFINITIVELY and UNAMBIGUOUSLY proven false by the evidence - not just disputed or contested.
- "reason": For "yes", state precisely what makes the message critically false, definitively debunked, and potentially harmful. For "no", explain why: e.g. it is accurate, contested but not definitively false, minor inaccuracy, opinion, joke, or not critically harmful.
- "evidence": For "yes", provide the most direct quote or summary from the web context that falsifies the harmful claim. For "no", use an empty string.
- "url": For "yes", include the URL that contains the corroborating source material. For "no", use an empty string.
In all cases, never reply with non-JSON or leave any field out. If you can't find suitable evidence or the claim isn't critically harmful, respond "misinformation":"no".
[User message]
${msg.content}
[Web context]
${answer.answer}
`.trim();
    try {
      const { result } = await aiFactCheckFlash(misinfoPrompt);
      let parsed = null;
      try {
        const match = result.match(/\{[\s\S]*?\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch {}
      if (parsed && parsed.misinformation === "yes") {
        misinformation = parsed;
      }
    } catch (e) {
      console.warn("Misinformation detection error:", e);
    }
  }
  return { contradiction, misinformation };
}

// ------ DISCORD BOT EVENT HANDLER ------
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`[DEBUG] Bot ready. Required env vars check:`);
  console.log(`- DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? 'SET' : 'MISSING'}`);
  console.log(`- DO_AI_API_KEY: ${process.env.DO_AI_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`- MONGODB_URI: ${process.env.MONGODB_URI ? 'SET' : 'MISSING'}`);
  console.log(`- EXA_API_KEY: ${process.env.EXA_API_KEY ? 'SET' : 'MISSING'}`);
});

client.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.MessageComponent) return;
  if (!interaction.customId.startsWith(SOURCE_BUTTON_ID)) return;

  const buttonId = interaction.customId.split(':')[1];
  // Try both the button ID and the message ID (for backwards compatibility)
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

  // Ignore trivial content or known other bot commands
  if (isOtherBotCommand(msg.content) || isTrivialOrSafeMessage(msg.content)) return;

  // Handle admin command (memory wipe)
  const handled = await handleAdminCommands(msg);
  if (handled) return;

    // Store the message!
  let thisMsgId = null;
  try {
    thisMsgId = await saveUserMessage(msg);
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
  if (msg.content.length <= MAX_FACTCHECK_CHARS) {
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
        // CONTRADICTION DETECTED (with jump link if present)
        if (detection.contradiction && detection.contradiction === "yes") {
          let evidenceUrl = detection.url || "";
          await msg.reply(
            `⚡ **CONTRADICTION DETECTED** ⚡\n` +
            `This message contradicts a prior statement you made:\n` +
            `> ${detection.evidence}\n` +
            `Reason: ${detection.reason}` +
            (evidenceUrl ? `\n[Jump to message](${evidenceUrl})` : "")
          );
        } else if (detection.misinformation && detection.misinformation.misinformation === "yes") {
          const misinfoReply = 
            `🚩 **MISINFORMATION DETECTED** 🚩\n` +
            `Reason: ${detection.misinformation.reason}\n` +
            (detection.misinformation.evidence ? `Evidence: ${detection.misinformation.evidence}` : "");
          
          const sourcesForButton = detection.misinformation.url ? [detection.misinformation.url] : [];
          
          if (sourcesForButton.length > 0) {
            await replyWithSourcesButton(msg, { content: misinfoReply }, sourcesForButton, latestSourcesByBotMsg);
          } else {
            await msg.reply(misinfoReply);
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
        msg.author.id, msg.channel.id, msg.guildId, 5, thisMsgId
      );
    } catch (e) {
      userHistoryArr = null;
      try { await msg.reply("The past refuses to reveal itself."); } catch {}
    }
    try {
      channelHistoryArr = await fetchChannelHistory(
        msg.channel.id, msg.guildId, 7, thisMsgId
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
Today is ${dateString}.
Reply concisely. Use recent context from user (by display name/nickname if available), me ("Arbiter" or "The Arbiter"), and others below. Include [SUMMARY]s if requested or contextually necessary. If [news] is present, focus on those results.${referencedSection ? ` If [referenced message] is present, treat it as the main subject of the user's message.
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
      const { result } = await aiUserFacing(prompt);
      replyText = result;
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
  filteredSources = [...new Set(sourcesUsed
    .map(u => cleanUrl(u))
    .filter(u => typeof u === "string" && u.startsWith("http")))];
  if (filteredSources.length > 0) {
    await replyWithSourcesButton(msg, { content: replyText }, filteredSources, latestSourcesByBotMsg);
  } else {
    await msg.reply(replyText);
  }
} catch (e) {
  console.error("Discord reply failed:", e);
}

    // ---- Log bot reply to Mongo ----
    try {
      const db = await connect();
      await db.collection("messages").insertOne({
        type: "message",
        user: client.user.id,
        username: client.user.username || "Arbiter",
        displayName: "Arbiter",
        channel: msg.channel.id,
        channelName: getChannelName(msg),
        guildId: msg.guildId,
        guildName: getGuildName(msg),
        isBot: true,
        content: replyText,
        ts: new Date(),
      });
    } catch (e) {
      console.warn("DB insert error (bot reply):", e);
    }

  } catch (err) {
    try {
      await msg.reply("Nobody will help you.");
    } catch {}
    console.error("AI user-facing failed:", err);
    }
}});
client.login(process.env.DISCORD_TOKEN);
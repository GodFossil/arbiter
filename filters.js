/**
 * Message filtering utilities for the Arbiter Discord bot
 * Contains logic for identifying and filtering various types of messages
 * that should be ignored or handled differently.
 */

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

/**
 * Determines if a message is a command from another bot that should be ignored
 * @param {string} content - The message content to check
 * @returns {boolean} True if the content is a known bot command
 */
function isOtherBotCommand(content) {
  if (!content) return false;
  return KNOWN_BOT_COMMANDS.some(cmd =>
    content.trim().toLowerCase().startsWith(cmd)
  );
}

/**
 * Determines if a message is trivial or safe content that doesn't require analysis
 * Uses multiple strategies to identify non-substantive messages:
 * - Length checks for very short messages
 * - Cached safe words lookup
 * - Regex pattern matching for emojis, punctuation, etc.
 * - Advanced detection for repeated words and combinations
 * 
 * @param {string} content - The message content to analyze
 * @returns {boolean} True if the message is considered trivial or safe
 */
function isTrivialOrSafeMessage(content) {
  if (!content || typeof content !== "string") return true;
  
  const trimmed = content.trim();
  const lower = trimmed.toLowerCase();
  
  // Quick length checks first (fastest)
  if (trimmed.length < 4) return true;
  if (trimmed.length > 200) return false; // Long messages are likely substantive
  
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

module.exports = {
  KNOWN_BOT_COMMANDS,
  TRIVIAL_PATTERNS,
  isOtherBotCommand,
  isTrivialOrSafeMessage
};

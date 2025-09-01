const { getSpecificPrinciple } = require("../../logic");
const { analyzeLogicalContent } = require("../../logic");
const { resetAllData, getCacheStatus } = require("../../storage");
const { getCircuitBreakers } = require("../../ai-utils");
const { clearSourceMappings, getSourceMappingsSize } = require("../ui/components");
const { getQueueStatus, clearAllQueues } = require("../../queue");
const { sanitizeUserInput } = require("../../prompt-security");

/**
 * Handle admin commands from guild owners
 * @param {Message} msg - Discord message object
 * @param {object} state - Bot state object with toggles
 * @param {object} logger - Structured logger with correlation context
 * @returns {boolean} True if admin command was handled
 */
async function handleAdminCommands(msg, state, logger = null) {
  // Use fallback logger if none provided (for backwards compatibility)
  const log = logger || require('../../logger').admin;
  
  log.debug("Admin command check", { 
    command: msg.content,
    userId: msg.author.id
  });
  
  if (!msg.guild) {
    log.debug("No guild found - not a server message");
    return false;
  }
  
  const ownerId = msg.guild.ownerId || (await msg.guild.fetchOwner()).id;
  log.debug("Checking admin permissions", { 
    guildOwnerId: ownerId, 
    messageAuthorId: msg.author.id 
  });
  
  if (msg.author.id !== ownerId) {
    log.warn("Admin command denied - not guild owner", { 
      attemptedUserId: msg.author.id,
      guildOwnerId: ownerId 
    });
    return false;
  }

  // ---- SYSTEM RESET ----
  if (msg.content === "!arbiter_reset_all") {
    const { logAudit } = require('../../logger');
    log.warn("System reset command initiated", { adminUserId: msg.author.id });
    logAudit("system_reset", msg.author.id, { guildId: msg.guildId });
    
    try {
      // Completely reset the database structure and all storage caches
      await resetAllData();
      
      // Clear job queues
      await clearAllQueues();
      
      // Clear remaining local caches
      clearSourceMappings();
      
      log.info("Complete database and memory reset performed", { 
        adminUserId: msg.author.id,
        guildId: msg.guildId
      });
      await msg.reply("🗑️ **COMPLETE SYSTEM RESET PERFORMED**\n\n• MongoDB database completely dropped and recreated\n• All collections, indexes, and artifacts removed\n• Fresh database structure initialized\n• All job queues cleared\n• All in-memory caches cleared\n• Arbiter reset to pristine state");
      return true;
    } catch (e) {
      log.error("Failed to reset database structure", { 
        error: e.message,
        adminUserId: msg.author.id
      });
      await msg.reply("The void resists complete reformation. Database structure may be partially reset.");
      return true;
    }
  }

  // ---- CONTENT ANALYSIS ----
  if (msg.content.startsWith("!arbiter_analyze ")) {
    try {
      const textToAnalyze = sanitizeUserInput(msg.content.replace("!arbiter_analyze ", "").trim(), { maxLength: 500 });
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
      log.error("Failed to analyze content", { 
        error: e.message,
        content: textToAnalyze?.slice(0, 50)
      });
      await msg.reply("Analysis proves elusive.");
      return true;
    }
  }

  // ---- PRINCIPLE LOOKUP ----
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
      log.error("Failed to get principle", { 
        error: e.message,
        principleName
      });
      await msg.reply("Wisdom remains hidden.");
      return true;
    }
  }
  
  // ---- SYSTEM STATUS ----
  if (msg.content === "!arbiter_status") {
    try {
      const { aiCircuitBreaker, exaCircuitBreaker } = getCircuitBreakers();
      const aiStatus = aiCircuitBreaker.getStatus();
      const exaStatus = exaCircuitBreaker.getStatus();
      const storageCacheStatus = getCacheStatus();
      const queueStatus = await getQueueStatus();
      
      await msg.reply(
        `⚡ **SYSTEM STATUS** ⚡\n\n` +
        `**Detection System:**\n` +
        `• Contradiction/Misinformation Detection: ${state.DETECTION_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}\n` +
        `• Logical Principles Framework: ${state.LOGICAL_PRINCIPLES_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
        `**Job Queue Status:**\n` +
        `• Contradiction Queue: ${queueStatus.contradiction?.waiting || 0} waiting, ${queueStatus.contradiction?.active || 0} active\n` +
        `• Misinformation Queue: ${queueStatus.misinformation?.waiting || 0} waiting, ${queueStatus.misinformation?.active || 0} active\n` +
        `• Summarization Queue: ${queueStatus.summarization?.waiting || 0} waiting, ${queueStatus.summarization?.active || 0} active\n` +
        `• User Reply Queue: ${queueStatus.userReply?.waiting || 0} waiting, ${queueStatus.userReply?.active || 0} active\n\n` +
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
        `• Validation Cache: ${storageCacheStatus.contradictionValidationCache} entries\n` +
        `• Source Mappings: ${getSourceMappingsSize()} entries`
      );
      return true;
    } catch (e) {
      log.error("Failed to get system status", { error: e.message });
      await msg.reply("Status inquiry proves elusive.");
      return true;
    }
  }
  
  // ---- DETECTION TOGGLE ----
  if (msg.content === "!arbiter_toggle_detection") {
    try {
      const newStatus = state.toggleDetection();
      const status = newStatus ? 'ENABLED' : 'DISABLED';
      const emoji = newStatus ? '✅' : '❌';
      
      const { logAudit } = require('../../logger');
      log.info("Detection system toggled", { 
        newStatus,
        adminUserId: msg.author.id,
        guildId: msg.guildId
      });
      logAudit("toggle_detection", msg.author.id, { 
        newStatus, 
        guildId: msg.guildId 
      });
      
      await msg.reply(
        `🔧 **DETECTION SYSTEM TOGGLED** 🔧\n\n` +
        `${emoji} **Contradiction/Misinformation Detection: ${status}**\n\n` +
        `${newStatus ? 
          '• Bot will now actively detect contradictions and misinformation\n• Messages will be analyzed for logical inconsistencies\n• Fact-checking will be performed against web sources' : 
          '• Bot will NOT detect contradictions or misinformation\n• Messages will still be stored for context and summaries\n• User-facing replies will continue to work normally'}`
      );
      return true;
    } catch (e) {
      log.error("Failed to toggle detection", { error: e.message });
      await msg.reply("The toggle resists manipulation.");
      return true;
    }
  }
  
  // ---- LOGICAL PRINCIPLES TOGGLE ----
  if (msg.content === "!arbiter_toggle_logic") {
    try {
      const newStatus = state.toggleLogicalPrinciples();
      const status = newStatus ? 'ENABLED' : 'DISABLED';
      const emoji = newStatus ? '✅' : '❌';
      
      log.info("Logical principles toggled by guild owner", { status: status.toLowerCase() });
      
      await msg.reply(
        `🧠 **LOGICAL PRINCIPLES TOGGLED** 🧠\n\n` +
        `${emoji} **Logical Reasoning Framework: ${status}**\n\n` +
        `${newStatus ? 
          '• AI will use advanced logical principles for reasoning\n• Enhanced contradiction detection with semantic validation\n• Fallacy detection and evidence hierarchy applied\n• Context-aware reasoning guidelines active' : 
          '• AI will use basic reasoning without enhanced framework\n• Standard contradiction detection only\n• No advanced logical principle injection\n• Faster processing but less sophisticated analysis'}`
      );
      return true;
    } catch (e) {
      log.error("Failed to toggle logical principles", { error: e.message });
      await msg.reply("Logic itself resists alteration.");
      return true;
    }
  }

  return false;
}

module.exports = {
  handleAdminCommands
};

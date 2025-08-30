const { getSpecificPrinciple } = require("../../logic");
const { analyzeLogicalContent } = require("../../logic");
const { resetAllData, getCacheStatus } = require("../../storage");
const { getCircuitBreakers } = require("../../ai-utils");
const { clearSourceMappings, getSourceMappingsSize } = require("../ui/components");

/**
 * Handle admin commands from guild owners
 * @param {Message} msg - Discord message object
 * @param {object} state - Bot state object with toggles
 * @returns {boolean} True if admin command was handled
 */
async function handleAdminCommands(msg, state) {
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

  // ---- SYSTEM RESET ----
  if (msg.content === "!arbiter_reset_all") {
    console.log("[DEBUG] Reset command matched - executing database reset");
    try {
      // Completely reset the database structure and all storage caches
      await resetAllData();
      
      // Clear remaining local caches
      clearSourceMappings();
      
      console.log("[ADMIN] Complete database and memory reset performed by guild owner");
      await msg.reply("🗑️ **COMPLETE SYSTEM RESET PERFORMED**\n\n• MongoDB database completely dropped and recreated\n• All collections, indexes, and artifacts removed\n• Fresh database structure initialized\n• All in-memory caches cleared\n• Arbiter reset to pristine state");
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to reset database structure.", e);
      await msg.reply("The void resists complete reformation. Database structure may be partially reset.");
      return true;
    }
  }

  // ---- CONTENT ANALYSIS ----
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
      console.warn("[MODLOG] Failed to get principle.", e);
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
      
      await msg.reply(
        `⚡ **SYSTEM STATUS** ⚡\n\n` +
        `**Detection System:**\n` +
        `• Contradiction/Misinformation Detection: ${state.DETECTION_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}\n` +
        `• Logical Principles Framework: ${state.LOGICAL_PRINCIPLES_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
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
      console.warn("[MODLOG] Failed to get system status.", e);
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
      
      console.log(`[ADMIN] Detection toggled ${status} by guild owner`);
      
      await msg.reply(
        `🔧 **DETECTION SYSTEM TOGGLED** 🔧\n\n` +
        `${emoji} **Contradiction/Misinformation Detection: ${status}**\n\n` +
        `${newStatus ? 
          '• Bot will now actively detect contradictions and misinformation\n• Messages will be analyzed for logical inconsistencies\n• Fact-checking will be performed against web sources' : 
          '• Bot will NOT detect contradictions or misinformation\n• Messages will still be stored for context and summaries\n• User-facing replies will continue to work normally'}`
      );
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to toggle detection.", e);
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
      
      console.log(`[ADMIN] Logical principles toggled ${status} by guild owner`);
      
      await msg.reply(
        `🧠 **LOGICAL PRINCIPLES TOGGLED** 🧠\n\n` +
        `${emoji} **Logical Reasoning Framework: ${status}**\n\n` +
        `${newStatus ? 
          '• AI will use advanced logical principles for reasoning\n• Enhanced contradiction detection with semantic validation\n• Fallacy detection and evidence hierarchy applied\n• Context-aware reasoning guidelines active' : 
          '• AI will use basic reasoning without enhanced framework\n• Standard contradiction detection only\n• No advanced logical principle injection\n• Faster processing but less sophisticated analysis'}`
      );
      return true;
    } catch (e) {
      console.warn("[MODLOG] Failed to toggle logical principles.", e);
      await msg.reply("Logic itself resists alteration.");
      return true;
    }
  }

  return false;
}

module.exports = {
  handleAdminCommands
};

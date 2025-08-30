/**
 * Message formatting utilities for Discord
 * Handles truncation, text processing, and display formatting
 */

/**
 * Truncate a message to fit Discord's character limits
 * @param {string} content - Content to truncate
 * @param {number} maxLength - Maximum length (default: 1950 to leave room for components)
 * @returns {string} Truncated content
 */
function truncateMessage(content, maxLength = 1950) {
  if (!content || content.length <= maxLength) return content;
  
  // Try to truncate at word boundary
  const truncated = content.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > maxLength * 0.8 ? lastSpace : maxLength;
  
  return content.slice(0, cutPoint) + '... [truncated]';
}

/**
 * Format user display name from Discord message
 * @param {Message} msg - Discord message object
 * @returns {string} User's display name
 */
function getDisplayName(msg) {
  if (!msg.guild) return msg.author.username;
  const member = msg.guild.members.cache.get(msg.author.id) || msg.member;
  if (member && member.displayName) return member.displayName;
  return msg.author.username;
}

/**
 * Format channel name from Discord message
 * @param {Message} msg - Discord message object
 * @returns {string} Channel name or ID fallback
 */
function getChannelName(msg) {
  try { 
    return msg.channel.name || `id:${msg.channel.id}`; 
  } catch { 
    return `id:${msg.channel.id}`; 
  }
}

/**
 * Format guild name from Discord message
 * @param {Message} msg - Discord message object
 * @returns {string} Guild name or ID fallback
 */
function getGuildName(msg) {
  try { 
    return msg.guild?.name || `id:${msg.guildId || "?"}`;
  } catch { 
    return `id:${msg.guildId || "?"}`;
  }
}

/**
 * Format a list of sources for display
 * @param {string[]} sources - Array of source URLs
 * @returns {string} Formatted source list
 */
function formatSourcesList(sources) {
  if (!sources || sources.length === 0) return "No sources available";
  return sources.map((url, i) => `**${i + 1}.** ${url}`).join('\n');
}

/**
 * Create a Discord hyperlink from URL
 * @param {string} url - URL to link to
 * @param {string} text - Display text for the link
 * @returns {string} Formatted Discord hyperlink
 */
function createDiscordLink(url, text) {
  return `[${text}](${url})`;
}

/**
 * Format contradiction detection result for Discord
 * @param {object} result - Detection result object
 * @param {string} username - User's display name
 * @returns {string} Formatted contradiction message
 */
function formatContradictionResult(result, username) {
  if (!result.contradicting || !result.contradiction) return null;
  
  const contradictingText = result.contradicting.includes('```') 
    ? result.contradicting 
    : `~~${result.contradicting}~~`;
    
  return `**⚠️ Logical Contradiction Detected**\n\n` +
         `**${username}**, you appear to have contradicted yourself:\n\n` +
         `${contradictingText}\n\n` +
         `**Contradiction:** ${result.contradiction}`;
}

/**
 * Format misinformation detection result for Discord
 * @param {object} result - Detection result object
 * @param {string} username - User's display name
 * @returns {string} Formatted misinformation message
 */
function formatMisinformationResult(result, username) {
  if (!result.misinformation) return null;
  
  return `**🚨 Critical Misinformation Detected**\n\n` +
         `**${username}**, this appears to be factually incorrect:\n\n` +
         `${result.misinformation}`;
}

/**
 * Combine contradiction and misinformation results into single message
 * @param {object} contradictionResult - Contradiction detection result
 * @param {object} misinformationResult - Misinformation detection result
 * @param {string} username - User's display name
 * @returns {string|null} Combined detection message or null if no detections
 */
function formatCombinedDetectionResult(contradictionResult, misinformationResult, username) {
  const contradictionMsg = contradictionResult ? formatContradictionResult(contradictionResult, username) : null;
  const misinfoMsg = misinformationResult ? formatMisinformationResult(misinformationResult, username) : null;
  
  if (!contradictionMsg && !misinfoMsg) return null;
  if (contradictionMsg && misinfoMsg) {
    return `${contradictionMsg}\n\n${misinfoMsg}`;
  }
  return contradictionMsg || misinfoMsg;
}

module.exports = {
  truncateMessage,
  getDisplayName,
  getChannelName,
  getGuildName,
  formatSourcesList,
  createDiscordLink,
  formatContradictionResult,
  formatMisinformationResult,
  formatCombinedDetectionResult
};

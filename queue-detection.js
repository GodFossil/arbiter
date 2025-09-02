// queue-detection.js
const { queueContradictionDetection, queueMisinformationDetection } = require('./queue');
const { fetchUserMessagesForDetection } = require('./storage');
const { isTrivialOrSafeMessage, isOtherBotCommand } = require('./filters');
const config = require('./config');

const MAX_FACTCHECK_CHARS = config.detection.maxFactcheckChars;
const USE_LOGICAL_PRINCIPLES = config.detection.logicalPrinciplesEnabled;

/**
 * Queue-based contradiction and misinformation detection
 * Replaces the synchronous detectContradictionOrMisinformation function
 * @param {Message} msg - Discord message object
 * @param {boolean} useLogicalPrinciples - Whether to use logical principles
 * @param {string} correlationId - Correlation ID for tracking
 * @returns {Promise<object>} Object with job promises for contradiction and misinformation
 */
async function detectContradictionOrMisinformationQueued(msg, useLogicalPrinciples = USE_LOGICAL_PRINCIPLES, correlationId) {
  const log = require('./logger').createCorrelatedLogger(require('./logger').queue, correlationId, 'queue-detection');
  
  log.debug("Starting queued detection", { 
    messageId: msg.id,
    contentLength: msg.content.length
  });
  
  // Pre-filtering (same as original)
  const isTrivial = isTrivialOrSafeMessage(msg.content);
  const isBotCommand = isOtherBotCommand(msg.content);
  
  if (isTrivial || isBotCommand) {
    log.debug("Message filtered out - skipping detection", { isTrivial, isBotCommand });
    return { contradiction: null, misinformation: null };
  }
  
  // Prepare common message data
  const messageData = {
    id: msg.id,
    content: msg.content,
    authorId: msg.author.id,
    channelId: msg.channel.id,
    guildId: msg.guildId
  };
  
  const jobPromises = {};
  
  // ---- QUEUE CONTRADICTION DETECTION ----
  try {
    const userHistory = await fetchUserMessagesForDetection(
      msg.author.id,
      msg.channel.id, 
      msg.guildId,
      msg.id,
      50
    );
    
    if (userHistory.length > 0) {
      const contradictionJobData = {
        messageData,
        messageId: messageData.id,
        userHistory,
        useLogicalPrinciples,
        correlationId
      };
      
      jobPromises.contradiction = queueContradictionDetection(contradictionJobData);
      log.debug("Contradiction detection job queued");
    } else {
      log.debug("No user history - skipping contradiction detection");
      jobPromises.contradiction = Promise.resolve({ contradiction: null });
    }
  } catch (error) {
    log.error("Failed to queue contradiction detection", { error: error.message });
    jobPromises.contradiction = Promise.resolve({ contradiction: null });
  }
  
  // ---- QUEUE MISINFORMATION DETECTION ----
  if (msg.content.length <= MAX_FACTCHECK_CHARS) {
    try {
      const misinformationJobData = {
        messageData,
        messageId: messageData.id,
        useLogicalPrinciples,
        correlationId
      };
      
      jobPromises.misinformation = queueMisinformationDetection(misinformationJobData);
      log.debug("Misinformation detection job queued");
    } catch (error) {
      log.error("Failed to queue misinformation detection", { error: error.message });
      jobPromises.misinformation = Promise.resolve({ misinformation: null });
    }
  } else {
    log.debug("Message too long for fact-checking", { 
      length: msg.content.length,
      maxLength: MAX_FACTCHECK_CHARS 
    });
    jobPromises.misinformation = Promise.resolve({ misinformation: null });
  }
  
  return jobPromises;
}

/**
 * Wait for detection jobs to complete and return results
 * @param {object} jobPromises - Object with contradiction and misinformation job promises
 * @param {object} logger - Correlation logger
 * @returns {Promise<object>} Detection results
 */
async function waitForDetectionResults(jobPromises, logger) {
  const log = logger || require('./logger').queue;
  
  try {
    // Wait for both jobs to complete
    const [contradictionJob, misinformationJob] = await Promise.all([
      jobPromises.contradiction || Promise.resolve({ contradiction: null }),
      jobPromises.misinformation || Promise.resolve({ misinformation: null })
    ]);
    
    // Get results from completed jobs
    let contradictionResult = null;
    let misinformationResult = null;
    
    if (contradictionJob?.finished) {
      const jobResult = await contradictionJob.finished();
      contradictionResult = jobResult?.contradiction || null;
    } else if (contradictionJob?.contradiction) {
      contradictionResult = contradictionJob.contradiction;
    }
    
    if (misinformationJob?.finished) {
      const jobResult = await misinformationJob.finished();
      misinformationResult = jobResult?.misinformation || null;
    } else if (misinformationJob?.misinformation) {
      misinformationResult = misinformationJob.misinformation;
    }
    
    log.debug("Detection jobs completed", {
      hasContradiction: contradictionResult?.contradiction === "yes",
      hasMisinformation: misinformationResult?.misinformation === "yes"
    });
    
    return {
      contradiction: contradictionResult,
      misinformation: misinformationResult
    };
    
  } catch (error) {
    log.error("Failed to wait for detection results", { error: error.message });
    return { contradiction: null, misinformation: null };
  }
}

module.exports = {
  detectContradictionOrMisinformationQueued,
  waitForDetectionResults
};

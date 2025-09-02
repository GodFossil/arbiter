// queue.js
const { Queue, Worker, QueueEvents } = require('bullmq');
const Redis = require('ioredis');
const config = require('./config');
const { queue: logger } = require('./logger');

// ---- REDIS CONNECTION ----
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
  maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
  retryDelayOnFailover: config.redis.retryDelayOnFailover,
  lazyConnect: true,
  enableOfflineQueue: false
};

const redis = new Redis(redisConfig);

// ---- QUEUE DEFINITIONS ----
const queues = {
  contradiction: new Queue(config.queues.contradiction.name, { connection: redis }),
  misinformation: new Queue(config.queues.misinformation.name, { connection: redis }),
  summarization: new Queue(config.queues.summarization.name, { connection: redis }),
  userReply: new Queue(config.queues.userReply.name, { connection: redis })
};

// ---- QUEUE EVENT MONITORING ----
Object.entries(queues).forEach(([queueType, queue]) => {
  const queueEvents = new QueueEvents(queue.name, { connection: redis });
  
  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    logger.debug("Job completed", { 
      queueType, 
      jobId,
      resultLength: returnvalue?.length || 0
    });
  });
  
  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error("Job failed", { 
      queueType, 
      jobId, 
      error: failedReason 
    });
  });
  
  queueEvents.on('stalled', ({ jobId }) => {
    logger.warn("Job stalled", { queueType, jobId });
  });
});

// ---- JOB PRODUCERS (QUEUE FUNCTIONS) ----

/**
 * Queue contradiction detection job
 * @param {object} jobData - Job payload with message data, correlationId, and detection config
 * @returns {Promise<object>} Job result
 */
async function queueContradictionDetection(jobData) {
  const timer = require('./logger').logHelpers.queueOperation(logger, 'contradiction', jobData.messageId);
  try {
    const job = await queues.contradiction.add('detect-contradiction', jobData, {
      removeOnComplete: config.queues.contradiction.removeOnComplete,
      removeOnFail: config.queues.contradiction.removeOnFail,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      }
    });
    
    timer.end({ jobId: job.id });
    logger.info("Contradiction detection job queued", { 
      jobId: job.id,
      correlationId: jobData.correlationId
    });
    
    return job;
  } catch (error) {
    timer.error(error);
    throw error;
  }
}

/**
 * Queue misinformation detection job
 * @param {object} jobData - Job payload with message data, correlationId, and detection config
 * @returns {Promise<object>} Job result
 */
async function queueMisinformationDetection(jobData) {
  const timer = require('./logger').logHelpers.queueOperation(logger, 'misinformation', jobData.messageId);
  try {
    const job = await queues.misinformation.add('detect-misinformation', jobData, {
      removeOnComplete: config.queues.misinformation.removeOnComplete,
      removeOnFail: config.queues.misinformation.removeOnFail,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      }
    });
    
    timer.end({ jobId: job.id });
    logger.info("Misinformation detection job queued", { 
      jobId: job.id,
      correlationId: jobData.correlationId
    });
    
    return job;
  } catch (error) {
    timer.error(error);
    throw error;
  }
}

/**
 * Queue summarization job
 * @param {object} jobData - Job payload with summarization data and correlationId
 * @returns {Promise<object>} Job result
 */
async function queueSummarization(jobData) {
  const timer = require('./logger').logHelpers.queueOperation(logger, 'summarization', 'batch');
  try {
    const job = await queues.summarization.add('summarize-messages', jobData, {
      removeOnComplete: config.queues.summarization.removeOnComplete,
      removeOnFail: config.queues.summarization.removeOnFail,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      }
    });
    
    timer.end({ jobId: job.id });
    logger.info("Summarization job queued", { 
      jobId: job.id,
      correlationId: jobData.correlationId
    });
    
    return job;
  } catch (error) {
    timer.error(error);
    throw error;
  }
}

/**
 * Queue user reply job
 * @param {object} jobData - Job payload with message data, correlationId, and reply config
 * @returns {Promise<object>} Job result
 */
async function queueUserReply(jobData) {
  const timer = require('./logger').logHelpers.queueOperation(logger, 'userReply', jobData.messageId);
  try {
    const job = await queues.userReply.add('generate-user-reply', jobData, {
      removeOnComplete: config.queues.userReply.removeOnComplete,
      removeOnFail: config.queues.userReply.removeOnFail,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      priority: 1 // Higher priority for user-facing responses
    });
    
    timer.end({ jobId: job.id });
    logger.info("User reply job queued", { 
      jobId: job.id,
      correlationId: jobData.correlationId
    });
    
    return job;
  } catch (error) {
    timer.error(error);
    throw error;
  }
}

// ---- QUEUE STATUS AND MANAGEMENT ----

/**
 * Get status of all queues
 * @returns {Promise<object>} Queue statistics
 */
async function getQueueStatus() {
  const status = {};
  
  for (const [queueType, queue] of Object.entries(queues)) {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed()
      ]);
      
      status[queueType] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    } catch (error) {
      status[queueType] = { error: error.message };
    }
  }
  
  return status;
}

/**
 * Clear all queues (admin function)
 * @returns {Promise<void>}
 */
async function clearAllQueues() {
  logger.warn("Clearing all queues");
  
  for (const [queueType, queue] of Object.entries(queues)) {
    try {
      await queue.obliterate({ force: true });
      logger.info("Queue cleared", { queueType });
    } catch (error) {
      logger.error("Failed to clear queue", { queueType, error: error.message });
    }
  }
}

/**
 * Gracefully close all queue connections
 * @returns {Promise<void>}
 */
async function closeQueues() {
  logger.info("Closing queue connections");
  
  await Promise.all([
    ...Object.values(queues).map(queue => queue.close()),
    redis.quit()
  ]);
}

module.exports = {
  // Queue instances
  queues,
  redis,
  
  // Job producers
  queueContradictionDetection,
  queueMisinformationDetection,  
  queueSummarization,
  queueUserReply,
  
  // Management
  getQueueStatus,
  clearAllQueues,
  closeQueues
};

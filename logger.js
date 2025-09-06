const pino = require('pino');

// Safe config loading to avoid circular dependencies
let config;
try {
  config = require('./config');
} catch (e) {
  // Fallback if config loading fails
  config = { 
    logging: { level: 'debug', enableCorrelationIds: true, enablePerformanceTracking: true }
  };
  console.warn('[LOGGER] Config loading failed, using defaults:', e.message);
}

/**
 * Centralized logging module for Arbiter Discord bot
 * Provides structured logging with correlation IDs and proper log levels
 */

// Determine log level from config first, then environment
const getLogLevel = () => {
  if (config.logging && config.logging.level) return config.logging.level;
  if (process.env.NODE_ENV === 'production') return 'info';
  if (process.env.NODE_ENV === 'test') return 'silent';
  return 'debug'; // development default
};

// Configure pino logger based on settings
const useSimpleFormat = config.logging?.useSimpleFormat || process.env.SIMPLE_LOGS === 'true';

const logger = pino({
  level: getLogLevel(),
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: useSimpleFormat ? false : 'SYS:standard',
        ignore: useSimpleFormat 
          ? 'pid,hostname,time,level,correlationId,userId,username,guildId,channelId,messageId,component' 
          : 'pid,hostname',
        messageFormat: useSimpleFormat 
          ? '{msg}' 
          : '{component} | {msg}',
        hideObject: useSimpleFormat
      }
    }
  })
});

/**
 * Create a child logger with correlation context
 * @param {string} correlationId - Unique ID to track request flow
 * @param {object} context - Additional context (userId, guildId, etc.)
 * @returns {object} Child logger with context
 */
function createCorrelatedLogger(correlationId, context = {}) {
  return logger.child({
    correlationId,
    ...context
  });
}

/**
 * Generate a correlation ID for tracking requests
 * @returns {string} Unique correlation ID
 */
function generateCorrelationId() {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Component-specific loggers with predefined context
 */
const componentLoggers = {
  startup: logger.child({ component: 'startup' }),
  discord: logger.child({ component: 'discord' }),
  mongo: logger.child({ component: 'mongo' }),
  ai: logger.child({ component: 'ai' }),
  detection: logger.child({ component: 'detection' }),
  admin: logger.child({ component: 'admin' }),
  ui: logger.child({ component: 'ui' }),
  storage: logger.child({ component: 'storage' }),
  exa: logger.child({ component: 'exa' })
};

/**
 * Performance timing utility
 */
class PerformanceTimer {
  constructor(logger, operation, context = {}) {
    this.logger = logger;
    this.operation = operation;
    this.context = context;
    this.startTime = Date.now();
    
    this.logger.debug('Operation started', {
      operation,
      ...context
    });
  }
  
  end(additionalContext = {}) {
    const duration = Date.now() - this.startTime;
    this.logger.info('Operation completed', {
      operation: this.operation,
      duration,
      ...this.context,
      ...additionalContext
    });
    return duration;
  }
  
  error(err, additionalContext = {}) {
    const duration = Date.now() - this.startTime;
    this.logger.error('Operation failed', {
      operation: this.operation,
      duration,
      error: err.message,
      stack: err.stack,
      ...this.context,
      ...additionalContext
    });
    return duration;
  }
}

/**
 * Helper functions for common logging patterns
 */
const logHelpers = {
  /**
   * Log message processing start
   */
  messageStart: (correlationId, msg) => {
    return createCorrelatedLogger(correlationId, {
      userId: msg.author.id,
      username: msg.author.username,
      guildId: msg.guildId,
      channelId: msg.channel.id,
      messageId: msg.id,
      component: 'message'
    });
  },

  /**
   * Log AI request performance
   */
  aiRequest: (logger, model, prompt) => {
    return new PerformanceTimer(logger, 'ai-request', {
      model,
      promptLength: prompt.length
    });
  },

  /**
   * Log detection analysis
   */
  detectionAnalysis: (logger, messageContent) => {
    return new PerformanceTimer(logger, 'detection-analysis', {
      contentLength: messageContent.length
    });
  },

  /**
   * Log database operations
   */
  dbOperation: (logger, operation, collection) => {
    return new PerformanceTimer(logger, 'db-operation', {
      operation,
      collection
    });
  }
};

/**
 * Error logging with automatic context extraction
 */
function logError(logger, error, operation, context = {}) {
  logger.error('Operation error', {
    operation,
    error: error.message,
    stack: error.stack,
    ...context
  });
}

/**
 * Structured event logging for analytics
 */
function logEvent(eventType, properties = {}) {
  logger.info('Event tracked', {
    eventType,
    timestamp: Date.now(),
    ...properties
  });
}

/**
 * Security/audit logging
 */
function logAudit(action, userId, details = {}) {
  logger.warn('Audit event', {
    action,
    userId,
    timestamp: Date.now(),
    ...details
  });
}

module.exports = {
  // Main logger
  logger,
  
  // Component loggers
  ...componentLoggers,
  
  // Utilities
  createCorrelatedLogger,
  generateCorrelationId,
  PerformanceTimer,
  logHelpers,
  logError,
  logEvent,
  logAudit
};

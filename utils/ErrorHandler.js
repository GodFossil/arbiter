<<<<<<< HEAD
const logger = require('./logger');

/**
 * Global error handler for async routes / events.
 */
function handleError(err, message = null) {
  logger.error(err);
  if (message && message.channel) {
    message.channel.send('❗ Something went wrong on my end. Try again in a moment.');
  }
}

module.exports = { handleError };
=======
// errorHandler.js
const logger = require('./logger');

class ErrorHandler {
    handle(error, context = '') {
        logger.error(`Error in ${context}:`, error.message || error);
        
        if (error.stack) {
            logger.debug('Stack trace:', error.stack);
        }
        
        return {
            success: false,
            error: error.message || 'An unknown error occurred',
            context
        };
    }
}

module.exports = new ErrorHandler();
>>>>>>> 0c4931a (Qwen 3 Code)

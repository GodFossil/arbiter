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
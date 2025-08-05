const logger = require('./logger');

class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    async handle(error, context = {}) {
        const errorId = this.generateErrorId();
        const errorInfo = {
            id: errorId,
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        };

        logger.error(`Error ${errorId}:`, errorInfo);

        // Track error frequency
        const errorType = error.constructor.name;
        const count = this.errorCounts.get(errorType) || 0;
        this.errorCounts.set(errorType, count + 1);

        // Handle specific error types
        if (error.code === 'RATE_LIMIT') {
            return this.handleRateLimit(error);
        } else if (error.code === 'NETWORK_ERROR') {
            return this.handleNetworkError(error);
        } else if (error.code === 'INVALID_REQUEST') {
            return this.handleInvalidRequest(error);
        }

        return {
            success: false,
            error: error.message,
            errorId,
            shouldRetry: count < this.maxRetries
        };
    }

    generateErrorId() {
        return Math.random().toString(36).substring(2, 15);
    }

    handleRateLimit(error) {
        const retryAfter = error.retryAfter || 60;
        return {
            success: false,
            error: 'Rate limit exceeded',
            retryAfter,
            shouldRetry: true
        };
    }

    handleNetworkError(error) {
        return {
            success: false,
            error: 'Network error',
            shouldRetry: true,
            retryDelay: this.retryDelay
        };
    }

    handleInvalidRequest(error) {
        return {
            success: false,
            error: 'Invalid request',
            shouldRetry: false
        };
    }

    async retry(operation, maxRetries = this.maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    logger.error(`Operation failed after ${maxRetries} attempts`);
                    throw error;
                }

                const delay = this.retryDelay * Math.pow(2, attempt - 1);
                logger.info(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    getErrorStats() {
        return {
            counts: Object.fromEntries(this.errorCounts),
            total: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0)
        };
    }
}

module.exports = new ErrorHandler();
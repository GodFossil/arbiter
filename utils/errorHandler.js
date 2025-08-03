class ErrorHandler {
  constructor(logger) {
    this.logger = logger;
    this.errorCounts = new Map();
    this.circuitBreakers = new Map();
    
    // Circuit breaker configuration
    this.circuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitorWindow: 300000 // 5 minutes
    };
  }

  // Main error handling method
  async handleError(error, context = {}, fallbackAction = null) {
    const errorType = this.classifyError(error);
    const errorKey = `${context.service || 'unknown'}:${errorType}`;

    // Log the error
    this.logError(error, context, errorType);

    // Track error frequency
    this.trackError(errorKey);

    // Check circuit breaker
    if (this.isCircuitOpen(context.service)) {
      return this.executeCircuitBreakerFallback(context, fallbackAction);
    }

    // Apply specific error handling strategies
    switch (errorType) {
      case 'rate_limit':
        return this.handleRateLimit(error, context, fallbackAction);
      
      case 'network':
        return this.handleNetworkError(error, context, fallbackAction);
      
      case 'api_error':
        return this.handleAPIError(error, context, fallbackAction);
      
      case 'timeout':
        return this.handleTimeout(error, context, fallbackAction);
      
      case 'auth':
        return this.handleAuthError(error, context, fallbackAction);
      
      default:
        return this.handleGenericError(error, context, fallbackAction);
    }
  }

  classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.code;

    // Rate limiting
    if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    }

    // Network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('connection') || 
        message.includes('timeout') || error.name === 'AbortError') {
      return 'network';
    }

    // API errors
    if (status >= 400 && status < 500) {
      if (status === 401 || status === 403) {
        return 'auth';
      }
      return 'api_error';
    }

    // Server errors
    if (status >= 500) {
      return 'server_error';
    }

    // Timeout specific
    if (error.name === 'TimeoutError' || message.includes('timeout')) {
      return 'timeout';
    }

    return 'generic';
  }

  async handleRateLimit(error, context, fallbackAction) {
    const service = context.service || 'unknown';
    const waitTime = this.extractWaitTime(error) || 60000; // Default 1 minute

    this.logger.warning(`Rate limit hit for ${service}, waiting ${waitTime}ms`, {
      service,
      waitTime,
      error: error.message
    });

    // For rate limits, we might want to queue the request or use cache
    if (context.useCache && context.cacheManager) {
      const cachedResult = context.cacheManager.get(context.cacheType, context.cacheKey);
      if (cachedResult) {
        this.logger.info(`Using cached result for ${service} due to rate limit`);
        return cachedResult;
      }
    }

    // Execute fallback if available
    if (fallbackAction) {
      try {
        return await fallbackAction();
      } catch (fallbackError) {
        this.logger.error('Fallback action failed after rate limit', { 
          originalError: error.message,
          fallbackError: fallbackError.message 
        });
      }
    }

    // Return error result indicating rate limit
    return {
      success: false,
      error: 'rate_limit',
      message: `Service temporarily unavailable due to rate limiting. Retry after ${Math.ceil(waitTime / 1000)} seconds.`,
      retryAfter: waitTime
    };
  }

  async handleNetworkError(error, context, fallbackAction) {
    const service = context.service || 'unknown';
    
    this.logger.warning(`Network error for ${service}`, {
      service,
      error: error.message,
      retryAttempt: context.retryAttempt || 0
    });

    // Try fallback immediately for network errors
    if (fallbackAction) {
      try {
        this.logger.info(`Executing fallback for ${service} network error`);
        return await fallbackAction();
      } catch (fallbackError) {
        this.logger.error('Network fallback failed', {
          originalError: error.message,
          fallbackError: fallbackError.message
        });
      }
    }

    return {
      success: false,
      error: 'network',
      message: 'Network connectivity issue. Using fallback data where available.',
      canRetry: true
    };
  }

  async handleAPIError(error, context, fallbackAction) {
    const service = context.service || 'unknown';
    const status = error.status || error.code;

    this.logger.error(`API error for ${service}`, {
      service,
      status,
      error: error.message
    });

    // For API errors, check if we have cached data
    if (context.useCache && context.cacheManager) {
      const cachedResult = context.cacheManager.get(context.cacheType, context.cacheKey);
      if (cachedResult) {
        this.logger.info(`Using stale cached result for ${service} due to API error`);
        return cachedResult;
      }
    }

    // Execute fallback
    if (fallbackAction) {
      try {
        return await fallbackAction();
      } catch (fallbackError) {
        this.logger.error('API error fallback failed', {
          originalError: error.message,
          fallbackError: fallbackError.message
        });
      }
    }

    return {
      success: false,
      error: 'api_error',
      message: `Service API error (${status}). Functionality may be limited.`,
      canRetry: status >= 500 // Only retry server errors
    };
  }

  async handleTimeout(error, context, fallbackAction) {
    const service = context.service || 'unknown';

    this.logger.warning(`Timeout for ${service}`, {
      service,
      timeout: context.timeout,
      error: error.message
    });

    // Timeouts often benefit from cached data
    if (context.useCache && context.cacheManager) {
      const cachedResult = context.cacheManager.get(context.cacheType, context.cacheKey);
      if (cachedResult) {
        this.logger.info(`Using cached result for ${service} due to timeout`);
        return cachedResult;
      }
    }

    if (fallbackAction) {
      try {
        return await fallbackAction();
      } catch (fallbackError) {
        this.logger.error('Timeout fallback failed', {
          originalError: error.message,
          fallbackError: fallbackError.message
        });
      }
    }

    return {
      success: false,
      error: 'timeout',
      message: 'Request timed out. Using available cached data.',
      canRetry: true
    };
  }

  async handleAuthError(error, context, fallbackAction) {
    const service = context.service || 'unknown';

    this.logger.error(`Authentication error for ${service}`, {
      service,
      error: error.message
    });

    // Auth errors typically can't use fallbacks, but we can try
    if (fallbackAction) {
      try {
        return await fallbackAction();
      } catch (fallbackError) {
        this.logger.error('Auth error fallback failed', {
          originalError: error.message,
          fallbackError: fallbackError.message
        });
      }
    }

    return {
      success: false,
      error: 'auth',
      message: `Authentication failed for ${service}. Please check API credentials.`,
      canRetry: false
    };
  }

  async handleGenericError(error, context, fallbackAction) {
    const service = context.service || 'unknown';

    this.logger.error(`Generic error for ${service}`, {
      service,
      error: error.message,
      stack: error.stack
    });

    if (fallbackAction) {
      try {
        return await fallbackAction();
      } catch (fallbackError) {
        this.logger.error('Generic error fallback failed', {
          originalError: error.message,
          fallbackError: fallbackError.message
        });
      }
    }

    return {
      success: false,
      error: 'generic',
      message: 'An unexpected error occurred. Using fallback functionality.',
      canRetry: true
    };
  }

  // Circuit breaker implementation
  trackError(errorKey) {
    const now = Date.now();
    const windowStart = now - this.circuitBreakerConfig.monitorWindow;

    if (!this.errorCounts.has(errorKey)) {
      this.errorCounts.set(errorKey, []);
    }

    const errors = this.errorCounts.get(errorKey);
    
    // Add current error
    errors.push(now);
    
    // Remove errors outside the monitoring window
    const recentErrors = errors.filter(timestamp => timestamp > windowStart);
    this.errorCounts.set(errorKey, recentErrors);

    // Check if we should open the circuit breaker
    if (recentErrors.length >= this.circuitBreakerConfig.failureThreshold) {
      this.openCircuitBreaker(errorKey);
    }
  }

  openCircuitBreaker(service) {
    const resetTime = Date.now() + this.circuitBreakerConfig.resetTimeout;
    this.circuitBreakers.set(service, { openedAt: Date.now(), resetAt: resetTime });
    
    this.logger.warning(`Circuit breaker opened for ${service}`, {
      service,
      resetAt: new Date(resetTime).toISOString()
    });
  }

  isCircuitOpen(service) {
    if (!service) return false;
    
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return false;

    // Check if reset time has passed
    if (Date.now() > breaker.resetAt) {
      this.circuitBreakers.delete(service);
      this.logger.info(`Circuit breaker reset for ${service}`);
      return false;
    }

    return true;
  }

  async executeCircuitBreakerFallback(context, fallbackAction) {
    const service = context.service || 'unknown';
    
    this.logger.info(`Circuit breaker active for ${service}, using fallback`);

    if (fallbackAction) {
      try {
        return await fallbackAction();
      } catch (error) {
        this.logger.error('Circuit breaker fallback failed', {
          service,
          error: error.message
        });
      }
    }

    return {
      success: false,
      error: 'circuit_breaker',
      message: `Service ${service} is temporarily unavailable. Using cached data where possible.`
    };
  }

  // Utility methods
  extractWaitTime(error) {
    // Try to extract wait time from rate limit headers or error message
    const message = error.message || '';
    const match = message.match(/retry.*?(\d+)/i);
    return match ? parseInt(match[1]) * 1000 : null;
  }

  logError(error, context, errorType) {
    const logData = {
      errorType,
      service: context.service,
      message: error.message,
      stack: error.stack,
      context: {
        ...context,
        timestamp: new Date().toISOString()
      }
    };

    if (errorType === 'rate_limit' || errorType === 'network') {
      this.logger.warning('Handled error', logData);
    } else {
      this.logger.error('Service error', logData);
    }
  }

  // Get error statistics
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      errorsByType: {},
      circuitBreakers: {},
      recentErrors: []
    };

    // Count recent errors
    const now = Date.now();
    const windowStart = now - this.circuitBreakerConfig.monitorWindow;

    for (const [key, timestamps] of this.errorCounts.entries()) {
      const recentErrors = timestamps.filter(t => t > windowStart);
      stats.totalErrors += recentErrors.length;
      
      const [service, errorType] = key.split(':');
      if (!stats.errorsByType[errorType]) {
        stats.errorsByType[errorType] = 0;
      }
      stats.errorsByType[errorType] += recentErrors.length;
    }

    // Circuit breaker status
    for (const [service, breaker] of this.circuitBreakers.entries()) {
      stats.circuitBreakers[service] = {
        openedAt: new Date(breaker.openedAt).toISOString(),
        resetAt: new Date(breaker.resetAt).toISOString(),
        isOpen: Date.now() < breaker.resetAt
      };
    }

    return stats;
  }
}

module.exports = ErrorHandler;
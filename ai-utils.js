const axios = require("axios");
const config = require('./config');
const logger = require('./logger');

// Environment constants
const EXA_API_KEY = process.env.EXA_API_KEY;

// Dynamic p-limit import
let pLimit;

// Rate limiters (initialized after p-limit loads)
let userFacingLimit, backgroundLimit, summaryLimit, factCheckLimit;

// Circuit breakers
let aiCircuitBreaker, exaCircuitBreaker;

// ---- RATE LIMITING SETUP ----
async function initializeRateLimiting() {
  try {
    logger.debug("Loading p-limit module...");
    // Load p-limit dynamically (ES module)
    pLimit = (await import("p-limit")).default;
    logger.debug("p-limit module loaded successfully");
    
    // Initialize rate limiters
    userFacingLimit = pLimit(config.limits.aiConcurrency); // Max concurrent user-facing replies (highest priority)
    backgroundLimit = pLimit(config.limits.aiConcurrency);  // Max concurrent background detections (medium priority) 
    summaryLimit = pLimit(1);     // Max 1 concurrent summarization (lowest priority)
    factCheckLimit = pLimit(config.limits.exaConcurrency);   // Max concurrent fact-checks (medium priority)
    
    logger.info("AI call limits configured", {
      userFacing: config.limits.aiConcurrency,
      background: config.limits.aiConcurrency, 
      summary: 1,
      factCheck: config.limits.exaConcurrency
    });
  } catch (error) {
    logger.error("Failed to initialize rate limiting", {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error; // Re-throw to fail initialization properly
  }
}

// ---- CIRCUIT BREAKER IMPLEMENTATION ----
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 60000; // 1 minute
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }
  
  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        logger.debug("Circuit breaker OPEN - failing fast", { name: this.name });
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      // Transition to HALF_OPEN for testing
      this.state = 'HALF_OPEN';
      logger.info("Circuit breaker transitioning to HALF_OPEN", { name: this.name });
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) { // Require 2 successes to close
        this.state = 'CLOSED';
        this.successCount = 0;
        logger.info("Circuit breaker recovered", { name: this.name, state: 'CLOSED' });
      }
    }
  }
  
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.successCount = 0;
      logger.warn("Circuit breaker failed during test", { name: this.name, state: 'OPEN' });
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.error("Circuit breaker threshold exceeded", { 
        name: this.name, 
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
        state: 'OPEN'
      });
    }
  }
  
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Initialize circuit breakers
function initializeCircuitBreakers() {
  // Create circuit breakers for external APIs
  aiCircuitBreaker = new CircuitBreaker('DigitalOcean-AI', {
    failureThreshold: 3,
    timeout: 120000, // 2 minutes
    resetTimeout: 60000 // 1 minute
  });

  exaCircuitBreaker = new CircuitBreaker('Exa-API', {
    failureThreshold: 5,
    timeout: 60000, // 1 minute  
    resetTimeout: 30000 // 30 seconds
  });

  logger.info("Circuit breakers initialized", { services: ['DigitalOcean-AI', 'Exa-API'] });
}

// Utility function for cleaning URLs
function cleanUrl(url) {
  return url.trim().replace(/[)\].,;:!?]+$/g, '');
}

// ---- EXA FACT CHECK AND NEWS HELPERS WITH CIRCUIT BREAKER ----
async function exaAnswer(query) {
  return await exaCircuitBreaker.execute(async () => {
    const res = await axios.post(
      "https://api.exa.ai/answer",
      { query, type: "neural" },
      { headers: { Authorization: `Bearer ${EXA_API_KEY}` } }
    );
    let urls = [];
    if (res.data?.urls) {
      urls = Array.isArray(res.data.urls) ? res.data.urls : [res.data.urls];
      urls = urls.map(u => cleanUrl(u));
    }
    if ((!urls.length) && typeof res.data.answer === "string") {
      const re = /(https?:\/\/[^\s<>"'`]+)/g;
      urls = Array.from(res.data.answer.matchAll(re), m => cleanUrl(m[1]));
    }
    return { answer: res.data.answer || "", urls: urls };
  }).catch(err => {
    logger.warn("Exa /answer failed", { error: err.message });
    return { answer: "", urls: [] };
  });
}

async function exaSearch(query, numResults = 10) {
  return await exaCircuitBreaker.execute(async () => {
    const res = await axios.post(
      "https://api.exa.ai/search",
      { query, numResults },
      { headers: { Authorization: `Bearer ${EXA_API_KEY}` } }
    );
    return Array.isArray(res.data.results) ? res.data.results : [];
  }).catch(err => {
    logger.warn("Exa /search failed", { error: err.message });
    return [];
  });
}

// ---- AI UTILS WITH RATE LIMITING & CIRCUIT BREAKERS ----
async function aiFlash(prompt) {
  // Import the AI functions when needed
  const { aiBackground } = require("./ai");
  
  if (!backgroundLimit) {
    logger.warn("Rate limiting not initialized, executing directly", { operation: 'background' });
    return await aiCircuitBreaker.execute(async () => {
      return aiBackground(prompt);
    });
  }
  
  logger.debug("Background AI queued", { 
    pending: backgroundLimit.pendingCount,
    active: backgroundLimit.activeCount
  });
  return await backgroundLimit(() => {
    return aiCircuitBreaker.execute(async () => {
      logger.debug("Background AI executing");
      return aiBackground(prompt);
    });
  });
}

async function aiFactCheckFlash(prompt) {
  // Import the AI functions when needed
  const { aiFactCheck } = require("./ai");
  
  if (!factCheckLimit) {
    logger.warn("Rate limiting not initialized, executing directly", { operation: 'factCheck' });
    return await aiCircuitBreaker.execute(async () => {
      return aiFactCheck(prompt);
    });
  }
  
  logger.debug("FactCheck AI queued", { 
    pending: factCheckLimit.pendingCount,
    active: factCheckLimit.activeCount
  });
  return await factCheckLimit(() => {
    return aiCircuitBreaker.execute(async () => {
      logger.debug("FactCheck AI executing");
      return aiFactCheck(prompt);
    });
  });
}

// Initialize the module
async function initializeAIUtils() {
  try {
    logger.debug("Starting AI utilities initialization...");
    initializeCircuitBreakers();
    logger.debug("Circuit breakers initialized");
    
    await initializeRateLimiting();
    logger.debug("Rate limiting initialized");
    
    logger.info("AI utilities initialization completed successfully");
  } catch (error) {
    logger.error("AI utilities initialization failed", {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    throw error;
  }
}

// Export all functions and classes
module.exports = {
  // Classes
  CircuitBreaker,
  
  // Initialization functions
  initializeRateLimiting,
  initializeAIUtils,
  
  // AI wrapper functions
  aiFlash,
  aiFactCheckFlash,
  
  // Exa API functions
  exaAnswer,
  exaSearch,
  
  // Utility functions
  cleanUrl,
  
  // Constants and getters for circuit breakers (read-only access)
  getCircuitBreakers: () => ({ aiCircuitBreaker, exaCircuitBreaker }),
  getRateLimiters: () => ({ userFacingLimit, backgroundLimit, summaryLimit, factCheckLimit }),
  
  // Environment constants
  EXA_API_KEY
};

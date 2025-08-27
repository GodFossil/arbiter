const axios = require("axios");

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
  // Load p-limit dynamically (ES module)
  pLimit = (await import("p-limit")).default;
  
  // Initialize rate limiters
  userFacingLimit = pLimit(3); // Max 3 concurrent user-facing replies (highest priority)
  backgroundLimit = pLimit(2);  // Max 2 concurrent background detections (medium priority) 
  summaryLimit = pLimit(1);     // Max 1 concurrent summarization (lowest priority)
  factCheckLimit = pLimit(2);   // Max 2 concurrent fact-checks (medium priority)
  
  console.log("[RATE LIMIT] AI call limits configured - UserFacing: 3, Background: 2, Summary: 1, FactCheck: 2");
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
        console.log(`[CIRCUIT BREAKER] ${this.name} is OPEN - failing fast`);
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      // Transition to HALF_OPEN for testing
      this.state = 'HALF_OPEN';
      console.log(`[CIRCUIT BREAKER] ${this.name} transitioning to HALF_OPEN`);
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
        console.log(`[CIRCUIT BREAKER] ${this.name} recovered - state: CLOSED`);
      }
    }
  }
  
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.successCount = 0;
      console.log(`[CIRCUIT BREAKER] ${this.name} failed during test - state: OPEN`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(`[CIRCUIT BREAKER] ${this.name} threshold exceeded (${this.failureCount}/${this.failureThreshold}) - state: OPEN`);
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

  console.log("[CIRCUIT BREAKER] Circuit breakers initialized - AI, Exa");
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
    console.warn("Exa /answer failed:", err.message);
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
    console.warn("Exa /search failed:", err.message);
    return [];
  });
}

// ---- AI UTILS WITH RATE LIMITING & CIRCUIT BREAKERS ----
async function aiFlash(prompt) {
  // Import the AI functions when needed
  const { aiBackground } = require("./ai");
  
  if (!backgroundLimit) {
    console.warn("[RATE LIMIT] Rate limiting not initialized, executing directly");
    return await aiCircuitBreaker.execute(async () => {
      return aiBackground(prompt);
    });
  }
  
  console.log(`[RATE LIMIT] Background AI queued (${backgroundLimit.pendingCount} pending, ${backgroundLimit.activeCount} active)`);
  return await backgroundLimit(() => {
    return aiCircuitBreaker.execute(async () => {
      console.log("[RATE LIMIT] Background AI executing");
      return aiBackground(prompt);
    });
  });
}

async function aiFactCheckFlash(prompt) {
  // Import the AI functions when needed
  const { aiFactCheck } = require("./ai");
  
  if (!factCheckLimit) {
    console.warn("[RATE LIMIT] Rate limiting not initialized, executing directly");
    return await aiCircuitBreaker.execute(async () => {
      return aiFactCheck(prompt);
    });
  }
  
  console.log(`[RATE LIMIT] FactCheck AI queued (${factCheckLimit.pendingCount} pending, ${factCheckLimit.activeCount} active)`);
  return await factCheckLimit(() => {
    return aiCircuitBreaker.execute(async () => {
      console.log("[RATE LIMIT] FactCheck AI executing");
      return aiFactCheck(prompt);
    });
  });
}

// Initialize the module
async function initializeAIUtils() {
  initializeCircuitBreakers();
  await initializeRateLimiting();
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

console.log("[STARTUP] Loading Arbiter bot...");
require("dotenv").config();

// Initialize structured logging early
const { startup: logger } = require('./logger');
logger.info("Environment loaded");
logger.info("Loading configuration...");
const config = require('./config');
logger.info("Configuration loaded and validated");

// ---- MODULE IMPORTS ----
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const { createDiscordClient } = require("./bot/core/client");
const botState = require("./bot/core/state");
const { handleMessageCreate } = require("./bot/events/messageCreate");
const { handleInteractionCreate } = require("./bot/events/interactionCreate");
const { cleanupSourceMappings } = require("./bot/ui/components");
const { performCacheCleanup } = require("./storage");
const { initializeAIUtils } = require("./ai-utils");

logger.info("All modules loaded successfully");

// ---- KEEPALIVE SERVER ----
const app = express();

// Security middleware (configurable)
if (config.security.enableHelmet) {
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for simple health endpoint
    crossOriginEmbedderPolicy: false
  }));
  logger.info("Helmet security headers enabled");
}

app.use(compression());

// Rate limiting (configurable)
if (config.security.enableRateLimit) {
  const healthCheckLimiter = rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    message: { error: config.security.rateLimit.message, retryAfter: Math.floor(config.security.rateLimit.windowMs / 1000) },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn("Rate limit exceeded", { 
        ip: req.ip, 
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        windowMs: config.security.rateLimit.windowMs,
        maxRequests: config.security.rateLimit.max
      });
      res.status(429).json({ 
        error: config.security.rateLimit.message, 
        retryAfter: Math.floor(config.security.rateLimit.windowMs / 1000)
      });
    }
  });

  app.use(healthCheckLimiter);
  logger.info("Rate limiting enabled", { 
    windowMs: config.security.rateLimit.windowMs,
    maxRequests: config.security.rateLimit.max
  });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Arbiter',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Security headers for all other requests
app.use((req, res) => {
  logger.warn("Unauthorized endpoint access", { 
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent')
  });
  res.status(404).json({ error: 'Not Found' });
});

const PORT = config.server.port;
app.listen(PORT, () => logger.info("Secure keepalive server started", { port: PORT }));

// ---- DISCORD CLIENT SETUP ----
const client = createDiscordClient();

// ---- AI INITIALIZATION ----
// Initialize AI utilities before login to prevent race conditions
logger.info("Initializing AI utilities...");
let aiInitialized = false;

async function initializeBot() {
  try {
    await initializeAIUtils();
    aiInitialized = true;
    logger.info("AI utilities initialized successfully");
    return true;
  } catch (e) {
    logger.error("Failed to initialize AI utilities", { error: e.message });
    return false;
  }
}

// ---- PERIODIC CLEANUP ----
let cleanupInterval;

async function performPeriodicCleanup() {
  try {
    // Clean up source mappings and disable expired buttons
    await cleanupSourceMappings(client);
    
    // Perform storage cache cleanup
    performCacheCleanup();
    
    const { storage } = require('./logger');
    storage.debug("Periodic cleanup completed");
  } catch (error) {
    const { storage } = require('./logger');
    storage.error("Periodic cleanup failed", { error: error.message });
  }
}

cleanupInterval = setInterval(performPeriodicCleanup, config.server.cleanupIntervalMinutes * 60 * 1000);

// ---- EVENT HANDLERS ----

client.once("ready", () => {
  const { discord } = require('./logger');
  discord.info("Bot ready", { 
    botTag: client.user.tag,
    guildCount: client.guilds.cache.size,
    userCount: client.users.cache.size
  });
});

client.on("messageCreate", async (msg) => {
  // Skip processing if AI utilities aren't initialized yet
  if (!aiInitialized) {
    return;
  }
  
  try {
    await handleMessageCreate(msg, client, botState);
  } catch (e) {
    const { discord } = require('./logger');
    discord.error("Message handling failed", { 
      error: e.message,
      userId: msg.author?.id,
      messageId: msg.id
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteractionCreate(interaction);
  } catch (e) {
    const { discord } = require('./logger');
    discord.error("Interaction handling failed", { 
      error: e.message,
      userId: interaction.user?.id,
      interactionId: interaction.id
    });
  }
});

// ---- ERROR HANDLING ----
client.on("error", error => {
  const { discord } = require('./logger');
  discord.error("Discord client error", { error: error.message });
});

client.on("warn", warning => {
  const { discord } = require('./logger');
  discord.warn("Discord client warning", { warning });
});

client.on("debug", info => {
  const { discord } = require('./logger');
  discord.debug("Discord debug info", { info });
});

client.on("shardError", (error, shardId) => {
  const { discord } = require('./logger');
  discord.error("Discord shard error", { shardId, error: error.message });
});

client.on("shardReady", (shardId, unavailableGuilds) => {
  const { discord } = require('./logger');
  discord.info("Discord shard ready", { 
    shardId, 
    unavailableGuilds: unavailableGuilds?.size || 0 
  });
});

client.on("shardDisconnect", (closeEvent, shardId) => {
  const { discord } = require('./logger');
  discord.warn("Discord shard disconnected", { shardId, closeEvent });
});

client.on("shardReconnecting", shardId => {
  const { discord } = require('./logger');
  discord.info("Discord shard reconnecting", { shardId });
});

// ---- INITIALIZATION AND LOGIN ----
async function startBot() {
  const initialized = await initializeBot();
  if (!initialized) {
    logger.error("Bot initialization failed - exiting");
    process.exit(1);
  }
  
  logger.info("Attempting to login to Discord");
  try {
    await client.login(process.env.DISCORD_TOKEN);
    logger.info("Discord login successful");
  } catch (error) {
    logger.error("Discord login failed", { error: error.message });
    process.exit(1);
  }
}

// Start the bot
startBot();

// ---- ERROR HANDLING ----
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { 
    reason: reason?.message || reason,
    promise: promise.toString()
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  // For uncaught exceptions, we should exit after logging
  setTimeout(() => process.exit(1), 1000);
});

// ---- GRACEFUL SHUTDOWN ----
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal} - graceful shutdown initiated`);
  
  try {
    // Clear intervals first
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      logger.info('Cleanup interval cleared');
    }
    
    // Close Discord client
    if (client && !client.destroyed) {
      client.destroy();
      logger.info('Discord client destroyed');
    }
    
    // Close MongoDB connection
    const { closeConnection } = require('./mongo');
    await closeConnection();
    logger.info('MongoDB connection closed');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

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
const { createDiscordClient } = require("./bot/core/client");
const botState = require("./bot/core/state");
const { handleMessageCreate } = require("./bot/events/messageCreate");
const { handleInteractionCreate } = require("./bot/events/interactionCreate");
const { cleanupSourceMappings } = require("./bot/ui/components");
const { performCacheCleanup } = require("./storage");
const { initializeAIUtils } = require("./ai-utils");
const { startWorkers } = require('./workers');
const { getQueueStatus } = require('./queue');

logger.info("All modules loaded successfully");

// ---- GLOBAL ERROR HANDLERS ----
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection at Promise', { 
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString()
  });
  gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception thrown', { 
    error: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code
  });
  console.error('[UNCAUGHT EXCEPTION]', error); // Also log to console for debugging
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// ---- KEEPALIVE SERVER ----
const app = express();
const PORT = config.server.port;
app.get('/', (_req, res) => res.send('Arbiter - OK'));
app.get('/status', async (_req, res) => {
  try {
    const queueStatus = await getQueueStatus();
    res.json({ status: 'OK', queues: queueStatus });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});
app.listen(PORT, () => logger.info("Keepalive server started", { port: PORT }));

// ---- DISCORD CLIENT SETUP ----
let client;
try {
  logger.info("Creating Discord client...");
  client = createDiscordClient();
  logger.info("Discord client created successfully");
} catch (error) {
  logger.fatal("Failed to create Discord client", { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
}

// ---- PERIODIC CLEANUP ----
try {
  logger.info("Setting up periodic cleanup...");
  setInterval(async () => {
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
  }, config.server.cleanupIntervalMinutes * 60 * 1000);
  logger.info("Periodic cleanup scheduled successfully");
} catch (error) {
  logger.fatal("Failed to setup periodic cleanup", { error: error.message, stack: error.stack });
  process.exit(1);
}

// ---- EVENT HANDLERS ----
try {
  logger.info("Setting up Discord event handlers...");

  client.once("ready", async () => {
  const { discord } = require('./logger');
  discord.info("Bot ready", { 
    botTag: client.user.tag,
    guildCount: client.guilds.cache.size,
    userCount: client.users.cache.size
  });
  
  // Initialize AI utilities with rate limiting
  try {
    await initializeAIUtils();
    discord.info("AI utilities initialized successfully");
  } catch (e) {
    discord.error("Failed to initialize AI utilities", { error: e.message });
  }
  
  // Start background workers for job processing
  try {
    await startWorkers();
    discord.info("Background workers started successfully");
  } catch (error) {
    discord.error("Failed to start workers", { error: error.message });
    process.exit(1);
  }
});

client.on("messageCreate", async (msg) => {
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

  logger.info("Discord event handlers setup completed");
} catch (error) {
  logger.fatal("Failed to setup Discord event handlers", { error: error.message, stack: error.stack });
  process.exit(1);
}

// ---- LOGIN ----
logger.info("Attempting to login to Discord");
client.login(process.env.DISCORD_TOKEN).then(() => {
  logger.info("Discord login initiated successfully");
}).catch(error => {
  logger.error("Discord login failed", { error: error.message });
  process.exit(1);
});

// ---- GRACEFUL SHUTDOWN ----
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal} - graceful shutdown initiated`);
  
  try {
    // Stop workers first
    const { stopWorkers } = require('./workers');
    await stopWorkers();
    logger.info('Workers stopped successfully');
    
    // Close queue connections
    const { closeQueues } = require('./queue');
    await closeQueues();
    logger.info('Queue connections closed');
    
    // Destroy Discord client
    client.destroy();
    logger.info('Discord client destroyed');
    
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }
  
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

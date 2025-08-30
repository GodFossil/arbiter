console.log("[STARTUP] Loading Arbiter bot...");
require("dotenv").config();
console.log("[STARTUP] Environment loaded");
console.log("[STARTUP] Loading configuration...");
const config = require('./config');
console.log("[STARTUP] Configuration loaded and validated");

// ---- MODULE IMPORTS ----
const express = require("express");
const { createDiscordClient } = require("./bot/core/client");
const botState = require("./bot/core/state");
const { handleMessageCreate } = require("./bot/events/messageCreate");
const { handleInteractionCreate } = require("./bot/events/interactionCreate");
const { cleanupSourceMappings } = require("./bot/ui/components");
const { performCacheCleanup } = require("./storage");
const { initializeAIUtils } = require("./ai-utils");

console.log("[STARTUP] All modules loaded successfully");

// ---- KEEPALIVE SERVER ----
const app = express();
const PORT = config.server.port;
app.get('/', (_req, res) => res.send('Arbiter - OK'));
app.listen(PORT, () => console.log(`Keepalive server running on port ${PORT}`));

// ---- DISCORD CLIENT SETUP ----
const client = createDiscordClient();

// ---- PERIODIC CLEANUP ----
setInterval(async () => {
  // Clean up source mappings and disable expired buttons
  await cleanupSourceMappings(client);
  
  // Perform storage cache cleanup
  performCacheCleanup();
  
  console.log(`[DEBUG] Periodic cleanup completed`);
}, config.server.cleanupIntervalMinutes * 60 * 1000);

// ---- EVENT HANDLERS ----

client.once("ready", async () => {
  console.log(`[READY] Logged in as ${client.user.tag}!`);
  console.log(`[READY] Serving ${client.guilds.cache.size} guilds with ${client.users.cache.size} users`);
  
  // Initialize AI utilities with rate limiting
  try {
    await initializeAIUtils();
    console.log("[READY] AI utilities initialized successfully");
  } catch (e) {
    console.error("[READY] Failed to initialize AI utilities:", e);
  }
});

client.on("messageCreate", async (msg) => {
  try {
    await handleMessageCreate(msg, client, botState);
  } catch (e) {
    console.error("[ERROR] Message handling failed:", e);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteractionCreate(interaction);
  } catch (e) {
    console.error("[ERROR] Interaction handling failed:", e);
  }
});

// ---- ERROR HANDLING ----
client.on("error", error => {
  console.error("[DISCORD] Client error:", error);
});

client.on("warn", warning => {
  console.warn("[DISCORD] Client warning:", warning);
});

client.on("debug", info => {
  console.log("[DISCORD] Debug info:", info);
});

client.on("shardError", (error, shardId) => {
  console.error(`[DISCORD] Shard ${shardId} error:`, error);
});

client.on("shardReady", (shardId, unavailableGuilds) => {
  console.log(`[DISCORD] Shard ${shardId} ready. Unavailable guilds: ${unavailableGuilds?.size || 0}`);
});

client.on("shardDisconnect", (closeEvent, shardId) => {
  console.warn(`[DISCORD] Shard ${shardId} disconnected:`, closeEvent);
});

client.on("shardReconnecting", shardId => {
  console.log(`[DISCORD] Shard ${shardId} reconnecting...`);
});

// ---- LOGIN ----
console.log("[STARTUP] Attempting to login to Discord...");
client.login(process.env.DISCORD_TOKEN).then(() => {
  console.log("[STARTUP] Discord login initiated successfully");
}).catch(error => {
  console.error("[STARTUP] Discord login failed:", error);
  process.exit(1);
});

// ---- GRACEFUL SHUTDOWN ----
process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Received SIGINT. Graceful shutdown...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Received SIGTERM. Graceful shutdown...');
  client.destroy();
  process.exit(0);
});

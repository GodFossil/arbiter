// mongo.js
const { MongoClient } = require("mongodb");
const config = require('./config');
const { mongo: logger } = require('./logger');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { maxPoolSize: config.mongodb.maxPoolSize });

let db = null;

async function connect() {
  if (!db) {
    await client.connect();
    db = client.db("arbiter-memory");
    
    // Create performance indexes
    await createIndexes(db);
  }
  return db;
}

async function createIndexes(db) {
  try {
    const collection = db.collection("messages");
    
    // Compound index for user history queries (most common)
    await collection.createIndex(
      { type: 1, user: 1, channel: 1, guildId: 1, ts: -1 },
      { name: "user_history_idx" }
    );
    
    // Compound index for channel history queries  
    await collection.createIndex(
      { type: 1, channel: 1, guildId: 1, ts: -1 },
      { name: "channel_history_idx" }
    );
    
    // Compound index for summarization queries (ascending timestamp order)
    await collection.createIndex(
      { type: 1, channel: 1, guildId: 1, ts: 1 },
      { name: "summarization_idx" }
    );
    
    // TTL index for automatic cleanup of old messages (configurable days)
    // Drop existing TTL index if it exists with different expiration
    try {
      const existingIndexes = await collection.indexes();
      const ttlIndex = existingIndexes.find(idx => idx.name === "ttl_cleanup");
      const newTTL = config.mongodb.ttlCleanupDays * 24 * 60 * 60;
      
      if (ttlIndex && ttlIndex.expireAfterSeconds !== newTTL) {
        logger.info("Dropping existing TTL index to recreate with new value", {
          oldTTL: ttlIndex.expireAfterSeconds,
          newTTL: newTTL
        });
        await collection.dropIndex("ttl_cleanup");
      }
    } catch (e) {
      // Index might not exist, continue
    }
    
    await collection.createIndex(
      { ts: 1 },
      { expireAfterSeconds: config.mongodb.ttlCleanupDays * 24 * 60 * 60, name: "ttl_cleanup" }
    );
    
    logger.info("Performance indexes created successfully");
  } catch (error) {
    logger.warn("Index creation warning", { error: error.message });
  }
}

async function resetDatabase() {
  try {
    if (!db) {
      await client.connect();
    }
    
    // Drop the entire database to remove all collections, indexes, and artifacts
    const dbName = "arbiter-memory";
    await client.db(dbName).dropDatabase();
    logger.warn("Database completely dropped", { database: dbName });
    
    // Reset the db reference so it gets recreated with fresh indexes
    db = null;
    
    // Reconnect and recreate the database structure
    await connect();
    logger.info("Database recreated with fresh structure", { database: dbName });
    
    return true;
  } catch (error) {
    logger.error("Database reset failed", { error: error.message });
    throw error;
  }
}

module.exports = { connect, resetDatabase };
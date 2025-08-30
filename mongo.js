// mongo.js
const { MongoClient } = require("mongodb");
const config = require('./config');

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
    await collection.createIndex(
      { ts: 1 },
      { expireAfterSeconds: config.mongodb.ttlCleanupDays * 24 * 60 * 60, name: "ttl_cleanup" }
    );
    
    console.log("[MONGO] Performance indexes created successfully");
  } catch (error) {
    console.warn("[MONGO] Index creation warning:", error.message);
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
    console.log(`[MONGO] Database '${dbName}' completely dropped`);
    
    // Reset the db reference so it gets recreated with fresh indexes
    db = null;
    
    // Reconnect and recreate the database structure
    await connect();
    console.log(`[MONGO] Database '${dbName}' recreated with fresh structure`);
    
    return true;
  } catch (error) {
    console.error("[MONGO] Database reset failed:", error);
    throw error;
  }
}

module.exports = { connect, resetDatabase };
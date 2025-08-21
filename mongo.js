// mongo.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { maxPoolSize: 10 });

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
    
    // TTL index for automatic cleanup of old messages (optional - 30 days)
    await collection.createIndex(
      { ts: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60, name: "ttl_cleanup" }
    );
    
    console.log("[MONGO] Performance indexes created successfully");
  } catch (error) {
    console.warn("[MONGO] Index creation warning:", error.message);
  }
}

module.exports = { connect };
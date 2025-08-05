const { MongoClient } = require('mongodb');
const logger = require('./logger');

let client, db;

async function connect() {
  if (client) return db;
  try {
    client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db('discord_factcheck');
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection failed:', err);
    db = null;
  }
  return db;
}

module.exports = { connect };
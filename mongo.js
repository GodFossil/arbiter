// mongo.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { maxPoolSize: 10 });

let db = null;

async function connect() {
  if (!db) {
    await client.connect();
    db = client.db("arbiter-memory");
  }
  return db;
}

module.exports = { connect };
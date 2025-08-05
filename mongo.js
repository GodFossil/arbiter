const { MongoClient } = require("mongodb");
const url = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB || "arbiterdb";

let client = null;
async function connect() {
  if (!client) {
    client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();
  }
  return client.db(dbName);
}

module.exports = { connect };
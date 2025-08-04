/**
 * Simple in-memory + optional Redis cache wrapper.
 * Falls back to in-memory if Redis env vars not provided.
 */
const NodeCache = require('node-cache');
const redis = require('redis');

class CacheManager {
  constructor() {
    this.mem = new NodeCache({ stdTTL: 600 }); // 10 min default
    this.redis = null;
    if (process.env.REDIS_URL) {
      this.redis = redis.createClient({ url: process.env.REDIS_URL });
      this.redis.on('error', () => {}); // suppress if Redis missing
      this.redis.connect().catch(() => {});
    }
  }

  async get(key) {
    if (this.redis) {
      const val = await this.redis.get(key);
      return val ? JSON.parse(val) : undefined;
    }
    return this.mem.get(key);
  }

  async set(key, value, ttl = 600) {
    if (this.redis) {
      return this.redis.setEx(key, ttl, JSON.stringify(value));
    }
    this.mem.set(key, value, ttl);
  }

  async del(key) {
    if (this.redis) {
      return this.redis.del(key);
    }
    this.mem.del(key);
  }
}

module.exports = new CacheManager();
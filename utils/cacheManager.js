const { Cache } = require('./db');
const logger = require('./logger');

class CacheManager {
    constructor() {
        this.memory = new Map(); // Still use memory cache for speed
    }

    async get(key) {
        try {
            // Check memory first
            const memoryItem = this.memory.get(key);
            if (memoryItem && Date.now() < memoryItem.expires) {
                return memoryItem.value;
            }

            // Check MongoDB
            const cache = await Cache.findOne({ key, expires: { $gt: new Date() } });
            if (cache) {
                // Update memory cache
                this.memory.set(key, {
                    value: cache.value,
                    expires: cache.expires.getTime()
                });
                return cache.value;
            }

            return null;
        } catch (error) {
            logger.error('Cache get error:', error);
            return null;
        }
    }

    async set(key, value, ttlMinutes = 60) {
        try {
            const expires = new Date(Date.now() + ttlMinutes * 60 * 1000);
            
            // Update memory cache
            this.memory.set(key, {
                value,
                expires: expires.getTime()
            });

            // Update MongoDB
            await Cache.findOneAndUpdate(
                { key },
                { value, expires },
                { upsert: true }
            );
        } catch (error) {
            logger.error('Cache set error:', error);
        }
    }

    async has(key) {
        return (await this.get(key)) !== null;
    }

    async delete(key) {
        try {
            this.memory.delete(key);
            await Cache.deleteOne({ key });
        } catch (error) {
            logger.error('Cache delete error:', error);
        }
    }

    async clear() {
        try {
            this.memory.clear();
            await Cache.deleteMany({});
        } catch (error) {
            logger.error('Cache clear error:', error);
        }
    }

    size() {
        return this.memory.size;
    }
}

module.exports = new CacheManager();
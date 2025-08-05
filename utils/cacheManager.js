const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class CacheManager {
    constructor(cacheDir = './cache') {
        this.cacheDir = cacheDir;
        this.memory = new Map();
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await this.loadMemory();
        } catch (error) {
            logger.error('Failed to initialize cache:', error);
        }
    }

    async loadMemory() {
        try {
            const memoryPath = path.join(this.cacheDir, 'memory.json');
            const data = await fs.readFile(memoryPath, 'utf8');
            const parsed = JSON.parse(data);
            this.memory = new Map(Object.entries(parsed));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load memory:', error);
            }
        }
    }

    async saveMemory() {
        try {
            const memoryPath = path.join(this.cacheDir, 'memory.json');
            const data = Object.fromEntries(this.memory);
            await fs.writeFile(memoryPath, JSON.stringify(data, null, 2));
        } catch (error) {
            logger.error('Failed to save memory:', error);
        }
    }

    get(key) {
        const item = this.memory.get(key);
        if (item && Date.now() < item.expires) {
            return item.value;
        }
        return null;
    }

    set(key, value, ttlMinutes = 60) {
        this.memory.set(key, {
            value,
            expires: Date.now() + (ttlMinutes * 60 * 1000)
        });
        this.saveMemory();
    }

    has(key) {
        return this.get(key) !== null;
    }

    delete(key) {
        const deleted = this.memory.delete(key);
        if (deleted) this.saveMemory();
        return deleted;
    }

    clear() {
        this.memory.clear();
        this.saveMemory();
    }

    size() {
        return this.memory.size;
    }
}

module.exports = new CacheManager();
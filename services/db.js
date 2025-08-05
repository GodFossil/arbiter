// db.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'memory.json');
    }

    async read() {
        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, return empty object
                return {};
            }
            logger.error('Database read error:', error);
            return {};
        }
    }

    async write(data) {
        try {
            await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            logger.error('Database write error:', error);
            return false;
        }
    }

    async get(key) {
        try {
            const db = await this.read();
            return db[key];
        } catch (error) {
            logger.error('Database get error:', error);
            return null;
        }
    }

    async set(key, value) {
        try {
            const db = await this.read();
            db[key] = value;
            return await this.write(db);
        } catch (error) {
            logger.error('Database set error:', error);
            return false;
        }
    }
}

module.exports = new Database();
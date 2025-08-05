const mongoose = require('mongoose');
const logger = require('./logger');

class Database {
    constructor() {
        this.connectionString = process.env.MONGODB_URI;
    }

    async connect() {
        try {
            await mongoose.connect(this.connectionString, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            logger.info('Connected to MongoDB');
        } catch (error) {
            logger.error('MongoDB connection error:', error);
            process.exit(1);
        }
    }

    async disconnect() {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB');
    }
}

// Schema for fact-check results
const FactCheck = mongoose.model('FactCheck', new mongoose.Schema({
    messageId: String,
    channelId: String,
    guildId: String,
    userId: String,
    originalMessage: String,
    claims: [{
        claim: String,
        verdict: String,
        confidence: Number,
        explanation: String,
        sources: [{
            title: String,
            url: String,
            reliability: String,
            snippet: String
        }]
    }],
    contradictions: Object,
    timestamp: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}));

// Schema for cached data
const Cache = mongoose.model('Cache', new mongoose.Schema({
    key: { type: String, unique: true, index: true },
    value: mongoose.Schema.Types.Mixed,
    expires: { type: Date, index: true },
    createdAt: { type: Date, default: Date.now }
}));

// Schema for user preferences
const UserPreference = mongoose.model('UserPreference', new mongoose.Schema({
    userId: { type: String, unique: true },
    preferences: {
        autoCheckThreads: { type: Boolean, default: false },
        confidenceThreshold: { type: Number, default: 50 },
        preferredSources: [String]
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}));

// Clean up expired cache entries
setInterval(async () => {
    try {
        const result = await Cache.deleteMany({ expires: { $lt: new Date() } });
        if (result.deletedCount > 0) {
            logger.info(`Cleaned up ${result.deletedCount} expired cache entries`);
        }
    } catch (error) {
        logger.error('Cache cleanup error:', error);
    }
}, 60000); // Run every minute

module.exports = { Database, FactCheck, Cache, UserPreference };

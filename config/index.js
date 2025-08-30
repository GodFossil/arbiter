const { loadConfig, validateEnvironment } = require('./validation');

// Validate environment variables first (fail-fast)
validateEnvironment();

// Load and export configuration
const config = loadConfig(process.env.NODE_ENV || 'default');

module.exports = config;

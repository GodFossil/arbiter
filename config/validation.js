const Joi = require('joi');
const fs = require('fs');
const path = require('path');

// Validation schema for configuration
const configSchema = Joi.object({
  server: Joi.object({
    port: Joi.number().integer().min(1).max(65535).required(),
    allowedChannels: Joi.string().allow(null).optional(),
    cleanupIntervalMinutes: Joi.number().integer().min(1).max(60).required()
  }).required(),

  ai: Joi.object({
    digitalOceanUrl: Joi.string().uri().required(),
    models: Joi.object({
      userFacing: Joi.object({
        primary: Joi.string().required(),
        fallback: Joi.string().required(),
        temperature: Joi.number().min(0).max(2).required(),
        maxTokens: Joi.number().integer().min(100).max(8192).required()
      }).required(),
      contradictionDetection: Joi.object({
        primary: Joi.string().required(),
        fallback: Joi.string().required(),
        temperature: Joi.number().min(0).max(2).required(),
        maxTokens: Joi.number().integer().min(100).max(8192).required()
      }).required(),
      misinformationDetection: Joi.object({
        primary: Joi.string().required(),
        fallback: Joi.string().required(),
        temperature: Joi.number().min(0).max(2).required(),
        maxTokens: Joi.number().integer().min(100).max(8192).required()
      }).required(),
      summarization: Joi.object({
        primary: Joi.string().required(),
        fallback: Joi.string().required(),
        temperature: Joi.number().min(0).max(2).required(),
        maxTokens: Joi.number().integer().min(100).max(8192).required()
      }).required()
    }).required()
  }).required(),

  detection: Joi.object({
    enabled: Joi.boolean().required(),
    logicalPrinciplesEnabled: Joi.boolean().required(),
    maxFactcheckChars: Joi.number().integer().min(100).max(2000).required()
  }).required(),

  cache: Joi.object({
    maxSourceMappings: Joi.number().integer().min(10).max(10000).required(),
    maxAnalysisCacheSize: Joi.number().integer().min(10).max(10000).required(),
    maxMessageCacheSize: Joi.number().integer().min(10).max(10000).required(),
    maxValidationCacheSize: Joi.number().integer().min(10).max(10000).required(),
    analysisCacheTtlMs: Joi.number().integer().min(1000).max(600000).required()
  }).required(),

  storage: Joi.object({
    maxContextMessagesPerChannel: Joi.number().integer().min(10).max(1000).required(),
    summaryBlockSize: Joi.number().integer().min(5).max(100).required(),
    trivialHistoryThreshold: Joi.number().min(0).max(1).required()
  }).required(),

  mongodb: Joi.object({
    maxPoolSize: Joi.number().integer().min(1).max(100).required(),
    ttlCleanupDays: Joi.number().integer().min(1).max(365).required()
  }).required(),

  limits: Joi.object({
    aiConcurrency: Joi.number().integer().min(1).max(20).required(),
    exaConcurrency: Joi.number().integer().min(1).max(20).required()
  }).required(),

  redis: Joi.object({
    host: Joi.string().required(),
    port: Joi.number().integer().min(1).max(65535).required(),
    db: Joi.number().integer().min(0).max(15).required(),
    maxRetriesPerRequest: Joi.number().integer().min(1).max(10).required(),
    retryDelayOnFailover: Joi.number().integer().min(50).max(5000).required()
  }).required(),

  queues: Joi.object({
    contradiction: Joi.object({
      name: Joi.string().required(),
      concurrency: Joi.number().integer().min(1).max(10).required(),
      removeOnComplete: Joi.number().integer().min(1).max(100).required(),
      removeOnFail: Joi.number().integer().min(1).max(100).required()
    }).required(),
    misinformation: Joi.object({
      name: Joi.string().required(),
      concurrency: Joi.number().integer().min(1).max(10).required(),
      removeOnComplete: Joi.number().integer().min(1).max(100).required(),
      removeOnFail: Joi.number().integer().min(1).max(100).required()
    }).required(),
    summarization: Joi.object({
      name: Joi.string().required(),
      concurrency: Joi.number().integer().min(1).max(5).required(),
      removeOnComplete: Joi.number().integer().min(1).max(50).required(),
      removeOnFail: Joi.number().integer().min(1).max(50).required()
    }).required(),
    userReply: Joi.object({
      name: Joi.string().required(),
      concurrency: Joi.number().integer().min(1).max(10).required(),
      removeOnComplete: Joi.number().integer().min(1).max(100).required(),
      removeOnFail: Joi.number().integer().min(1).max(100).required()
    }).required()
  }).required(),

  logging: Joi.object({
    level: Joi.string().valid('debug', 'info', 'warn', 'error', 'silent').required(),
    enableCorrelationIds: Joi.boolean().required(),
    enablePerformanceTracking: Joi.boolean().required()
  }).required()
});

// Environment variables validation schema
const envSchema = Joi.object({
  DISCORD_TOKEN: Joi.string().required(),
  DO_AI_API_KEY: Joi.string().required(),
  MONGODB_URI: Joi.string().uri().required(),
  EXA_API_KEY: Joi.string().required(),
  PORT: Joi.string().optional(),
  ALLOWED_CHANNELS: Joi.string().optional(),
  REDIS_URL: Joi.string().uri().optional()
}).unknown(true); // Allow unknown environment variables (platform-specific vars like KUBERNETES_SERVICE_PORT_HTTPS)

/**
 * Load and validate configuration from JSON files and environment variables
 * @param {string} environment - Environment name (default, production, etc.)
 * @returns {object} Validated configuration object
 */
function loadConfig(environment = 'default') {
  try {
    // Load base configuration
    const defaultConfigPath = path.join(__dirname, 'default.json');
    const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));

    // Try to load environment-specific overrides
    let config = { ...defaultConfig };
    const envConfigPath = path.join(__dirname, `${environment}.json`);
    if (fs.existsSync(envConfigPath) && environment !== 'default') {
      const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
      config = mergeConfig(defaultConfig, envConfig);
    }

    // Override with environment variables
    if (process.env.PORT) {
      config.server.port = parseInt(process.env.PORT, 10);
    }
    if (process.env.ALLOWED_CHANNELS) {
      config.server.allowedChannels = process.env.ALLOWED_CHANNELS;
    }

    // Validate configuration
    const { error: configError, value: validatedConfig } = configSchema.validate(config);
    if (configError) {
      throw new Error(`Configuration validation error: ${configError.message}`);
    }

    // Validate environment variables
    const { error: envError } = envSchema.validate(process.env);
    if (envError) {
      throw new Error(`Environment validation error: ${envError.message}`);
    }

    console.log(`[CONFIG] Configuration loaded and validated successfully`, { environment });
    return validatedConfig;

  } catch (error) {
    console.error('[CONFIG] Failed to load configuration:', error.message);
    process.exit(1);
  }
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(base, override) {
  const result = { ...base };
  for (const key in override) {
    if (typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key])) {
      result[key] = mergeConfig(base[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Validate that required environment variables exist at startup
 * This is called before loading configuration to fail fast
 */
function validateEnvironment() {
  const { error } = envSchema.validate(process.env);
  if (error) {
    console.error('[CONFIG] Environment validation failed:', error.message);
    console.error('[CONFIG] Please ensure all required environment variables are set:');
    console.error('  - DISCORD_TOKEN');
    console.error('  - DO_AI_API_KEY');  
    console.error('  - MONGODB_URI');
    console.error('  - EXA_API_KEY');
    process.exit(1);
  }
}

module.exports = {
  loadConfig,
  validateEnvironment,
  configSchema,
  envSchema
};

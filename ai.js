const axios = require('axios');
const config = require('./config');
const { ai: logger, logHelpers } = require('./logger');
const DO_AI_URL = config.ai.digitalOceanUrl;
const DO_AI_KEY = process.env.DO_AI_API_KEY;

async function doAIRequest(prompt, modelNames, temperature = 0.7, maxTokens = 2048) {
  // Check if API key is set
  if (!DO_AI_KEY) {
    throw new Error("DO_AI_API_KEY environment variable not set");
  }
  
  logger.info("AI request started", { 
    models: modelNames,
    temperature,
    maxTokens,
    promptLength: prompt.length
  });
  
  for (const model of modelNames) {
    const timer = logHelpers.aiRequest(logger, model, prompt);
    try {
      logger.debug("Trying model", { model });
      const res = await axios.post(
        DO_AI_URL,
        {
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${DO_AI_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const text = res.data.choices?.[0]?.message?.content;
      if (text) {
        timer.end({ 
          success: true,
          responseLength: text.length
        });
        return { result: text, modelUsed: model };
      } else {
        timer.error(new Error("Empty response"));
        logger.warn("Model returned empty response", { model });
      }
    } catch (err) {
      timer.error(err);
      logger.warn("Model request failed", { 
        model,
        error: err.response?.data || err.message
      });
      if (model === modelNames[modelNames.length - 1]) throw err;
    }
  }
  throw new Error("All DigitalOcean AI models failed");
}

// User-Facing Replies
exports.aiUserFacing = (prompt) => {
  const models = config.ai.models.userFacing;
  return doAIRequest(prompt, [models.primary, models.fallback], models.temperature, models.maxTokens);
};

// Background tasks (Contradiction Detection)
exports.aiBackground = (prompt) => {
  const models = config.ai.models.contradictionDetection;
  return doAIRequest(prompt, [models.primary, models.fallback], models.temperature, models.maxTokens);
};

// Summarization/Memory Pruning
exports.aiSummarization = (prompt) => {
  const models = config.ai.models.summarization;
  return doAIRequest(prompt, [models.primary, models.fallback], models.temperature, models.maxTokens);
};

// News & Fact-Checking Queries
exports.aiFactCheck = (prompt) => {
  const models = config.ai.models.misinformationDetection;
  return doAIRequest(prompt, [models.primary, models.fallback], models.temperature, models.maxTokens);
};

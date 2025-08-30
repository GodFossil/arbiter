const axios = require('axios');
const config = require('./config');
const DO_AI_URL = config.ai.digitalOceanUrl;
const DO_AI_KEY = process.env.DO_AI_API_KEY;

async function doAIRequest(prompt, modelNames, temperature = 0.7, maxTokens = 2048) {
  // Check if API key is set
  if (!DO_AI_KEY) {
    throw new Error("DO_AI_API_KEY environment variable not set");
  }
  
  console.log(`[AI] Attempting request with models: ${modelNames.join(', ')}`);
  
  for (const model of modelNames) {
    try {
      console.log(`[AI] Trying model: ${model}`);
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
        console.log(`[AI] Success with model: ${model}`);
        return { result: text, modelUsed: model };
      } else {
        console.warn(`[AI] Model ${model} returned empty response`);
      }
    } catch (err) {
      console.warn(`[AI] Model ${model} failed:`, err.response?.data || err.message);
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

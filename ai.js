const axios = require('axios');
const DO_AI_URL = 'https://inference.do-ai.run/v1/chat/completions';
const DO_AI_KEY = process.env.DO_AI_API_KEY;

async function doAIRequest(prompt, modelNames, temperature = 0.7, maxTokens = 2048) {
  for (const model of modelNames) {
    try {
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
      if (text) return { result: text, modelUsed: model };
    } catch (err) {
      console.warn(`Model ${model} failed:`, err.message);
      if (model === modelNames[modelNames.length - 1]) throw err;
    }
  }
  throw new Error("All DigitalOcean AI models failed");
}

// User-Facing Replies
exports.aiUserFacing = (prompt) =>
  doAIRequest(prompt, ['openai-gpt-5', 'anthropic-claude-3.7-sonnet'], 0.8, 2048);

// Background tasks (Contradiction Detection)
exports.aiBackground = (prompt) =>
  doAIRequest(prompt, ['openai-gpt-4o-mini', 'llama3.3-70b-instruct'], 0.3, 1024);

// Summarization/Memory Pruning
exports.aiSummarization = (prompt) =>
  doAIRequest(prompt, ['anthropic-claude-3.5-haiku', 'mistral-nemo-instruct-2407'], 0.5, 1024);

// News & Fact-Checking Queries
exports.aiFactCheck = (prompt) =>
  doAIRequest(prompt, ['openai-gpt-4o', 'deepseek-r1-distill-llama-70b'], 0.3, 1536);

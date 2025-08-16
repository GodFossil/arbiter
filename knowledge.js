const axios = require('axios');
const { connect } = require('./mongo');

const DO_AI_URL = "https://inference.do-ai.run/v1";
const DO_AI_KEY = process.env.DO_AI_API_KEY;
const EMBEDDINGS_MODEL = "sentence-transformers/multi-qa-mpnet-base-dot-v1";

/**
 * Generate embedding for a query text
 */
async function generateQueryEmbedding(text) {
  if (!DO_AI_KEY) {
    throw new Error("DO_AI_API_KEY environment variable not set");
  }
  
  try {
    const response = await axios.post(
      DO_AI_URL,
      {
        model: EMBEDDINGS_MODEL,
        input: text
      },
      {
        headers: {
          'Authorization': `Bearer ${DO_AI_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.data[0].embedding;
  } catch (error) {
    console.warn(`[KNOWLEDGE] Failed to generate query embedding: ${error.message}`);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Query the knowledge base for relevant information
 * @param {string} queryText - The text to search for
 * @param {number} topK - Number of top results to return (default: 5)
 * @returns {Promise<Array>} Array of relevant knowledge chunks
 */
async function queryKnowledge(queryText, topK = 5) {
  try {
    console.log(`[KNOWLEDGE] Searching for: "${queryText}"`);
    
    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(queryText);
    
    // Connect to database and fetch all knowledge chunks
    const db = await connect();
    const allChunks = await db.collection("knowledge").find({}).toArray();
    
    if (allChunks.length === 0) {
      console.log("[KNOWLEDGE] No knowledge base found. Run 'node load-docs.js' to build knowledge base.");
      return [];
    }
    
    console.log(`[KNOWLEDGE] Searching through ${allChunks.length} knowledge chunks`);
    
    // Calculate similarities and rank
    const scoredChunks = allChunks.map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));
    
    // Sort by similarity and take top K
    const topChunks = scoredChunks
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .filter(chunk => chunk.similarity > 0.3); // Filter out very low similarity matches
    
    console.log(`[KNOWLEDGE] Found ${topChunks.length} relevant chunks (similarity > 0.3)`);
    
    return topChunks.map(chunk => ({
      filename: chunk.filename,
      content: chunk.content,
      similarity: chunk.similarity,
      chunkIndex: chunk.chunkIndex
    }));
    
  } catch (error) {
    console.warn(`[KNOWLEDGE] Query failed: ${error.message}`);
    return [];
  }
}

/**
 * Format knowledge chunks for use in AI prompts
 * @param {Array} knowledgeChunks - Array of knowledge chunks from queryKnowledge
 * @returns {string} Formatted reference material block
 */
function formatReferenceBlock(knowledgeChunks) {
  if (!knowledgeChunks || knowledgeChunks.length === 0) {
    return "";
  }
  
  const formattedChunks = knowledgeChunks.map((chunk, index) => 
    `[${chunk.filename}#${chunk.chunkIndex}] ${chunk.content}`
  ).join('\n\n');
  
  return `[REFERENCE MATERIAL]\n${formattedChunks}\n`;
}

/**
 * Get knowledge statistics
 */
async function getKnowledgeStats() {
  try {
    const db = await connect();
    const totalChunks = await db.collection("knowledge").countDocuments();
    const fileGroups = await db.collection("knowledge").aggregate([
      { $group: { _id: "$filename", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    return {
      totalChunks,
      totalFiles: fileGroups.length,
      fileBreakdown: fileGroups
    };
  } catch (error) {
    console.warn(`[KNOWLEDGE] Failed to get stats: ${error.message}`);
    return { totalChunks: 0, totalFiles: 0, fileBreakdown: [] };
  }
}

module.exports = {
  queryKnowledge,
  formatReferenceBlock,
  getKnowledgeStats,
  generateQueryEmbedding
};

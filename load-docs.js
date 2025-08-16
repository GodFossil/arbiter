require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { connect } = require("./mongo");

const DO_AI_URL = "https://inference.do-ai.run/v1";
const DO_AI_KEY = process.env.DO_AI_API_KEY;

// Configuration
const EMBEDDINGS_MODEL = "sentence-transformers/multi-qa-mpnet-base-dot-v1"; // 768 dimensions
const CHUNK_SIZE = 400; // Target tokens per chunk
const OVERLAP_SIZE = 50; // Token overlap between chunks
const DOCS_FOLDER = "./docs";

console.log("🚀 Starting knowledge base ingestion...");

async function generateEmbedding(text) {
  if (!DO_AI_KEY) {
    throw new Error("DO_AI_API_KEY environment variable not set");
  }
  
  try {
    const response = await axios.post(
      `${DO_AI_URL}/embeddings`,
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
    console.error(`Failed to generate embedding for text: ${text.substring(0, 100)}...`);
    throw error;
  }
}

function chunkText(text, maxTokens = CHUNK_SIZE, overlap = OVERLAP_SIZE) {
  // Simple token estimation: ~4 chars per token
  const maxChars = maxTokens * 4;
  const overlapChars = overlap * 4;
  
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const chunks = [];
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    
    // If adding this paragraph would exceed chunk size, save current chunk
    if (currentChunk && (currentChunk.length + trimmed.length > maxChars)) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap from end of previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlapChars / 5)); // ~5 chars per word
      currentChunk = overlapWords.join(' ') + '\n\n' + trimmed;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 50); // Filter very small chunks
}

async function processMarkdownFile(filePath) {
  const filename = path.basename(filePath, '.md');
  console.log(`📄 Processing: ${filename}.md`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const chunks = chunkText(content);
  
  console.log(`   → Generated ${chunks.length} chunks`);
  
  const processedChunks = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`   → Embedding chunk ${i + 1}/${chunks.length}...`);
    
    try {
      const embedding = await generateEmbedding(chunk);
      
      processedChunks.push({
        filename: filename,
        chunkIndex: i,
        content: chunk,
        embedding: embedding,
        tokenEstimate: Math.ceil(chunk.length / 4),
        createdAt: new Date()
      });
      
      // Rate limiting - small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`   ❌ Failed to process chunk ${i + 1}: ${error.message}`);
    }
  }
  
  return processedChunks;
}

async function createVectorIndex(db) {
  try {
    // Check if index already exists
    const indexes = await db.collection("knowledge").indexes();
    const hasVectorIndex = indexes.some(idx => idx.name && idx.name.includes('embedding'));
    
    if (!hasVectorIndex) {
      console.log("🔧 Creating vector search index...");
      
      await db.collection("knowledge").createIndex(
        { embedding: "2dsphere" },
        { name: "embedding_vector_index" }
      );
      
      console.log("✅ Vector index created successfully");
    } else {
      console.log("✅ Vector index already exists");
    }
  } catch (error) {
    console.warn("⚠️  Failed to create vector index (will still work with slower searches):", error.message);
  }
}

async function main() {
  try {
    // Connect to database
    const db = await connect();
    console.log("✅ Connected to MongoDB");
    
    // Create vector index
    await createVectorIndex(db);
    
    // Clear existing knowledge
    const deleteResult = await db.collection("knowledge").deleteMany({});
    console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing knowledge entries`);
    
    // Find all .md files in docs folder
    const mdFiles = fs.readdirSync(DOCS_FOLDER)
      .filter(file => file.endsWith('.md') && file !== 'README.md')
      .map(file => path.join(DOCS_FOLDER, file));
    
    if (mdFiles.length === 0) {
      console.log("📝 No .md files found in ./docs/ folder (excluding README.md)");
      console.log("   Add your knowledge files to ./docs/ and run this script again.");
      return;
    }
    
    console.log(`📚 Found ${mdFiles.length} knowledge files to process`);
    
    // Process all files
    let totalChunks = 0;
    for (const filePath of mdFiles) {
      try {
        const chunks = await processMarkdownFile(filePath);
        
        if (chunks.length > 0) {
          await db.collection("knowledge").insertMany(chunks);
          totalChunks += chunks.length;
          console.log(`   ✅ Stored ${chunks.length} chunks`);
        }
        
      } catch (error) {
        console.error(`   ❌ Failed to process ${path.basename(filePath)}: ${error.message}`);
      }
    }
    
    console.log(`\n🎉 Knowledge base ingestion complete!`);
    console.log(`   📊 Total files processed: ${mdFiles.length}`);
    console.log(`   📊 Total chunks stored: ${totalChunks}`);
    console.log(`   📊 Embeddings model: ${EMBEDDINGS_MODEL}`);
    console.log(`\n💡 Usage: The bot will now use this knowledge for enhanced reasoning`);
    
  } catch (error) {
    console.error("❌ Knowledge base ingestion failed:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { generateEmbedding, chunkText, processMarkdownFile };

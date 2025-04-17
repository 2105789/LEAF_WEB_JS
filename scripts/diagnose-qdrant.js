import { QdrantClient } from "@qdrant/js-client-rest";
import { pipeline } from '@xenova/transformers';
import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Qdrant client configuration - same as in chat.js
const QDRANT_URL = "https://1f924b4d-5cfa-4e17-9709-e7683b563598.europe-west3-0.gcp.cloud.qdrant.io:6333";
const QDRANT_API_KEY = "Nygu4XKFKDhPxO47WOuaY_g2YsX3XTFacn39AvxaeOwtZ2Qnjbh46A";
const COLLECTION_NAME = "leaf_data_v2";

// Initialize client
const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY
});

// Initialize embedding pipeline
let embeddingPipeline;

async function initializeEmbeddingPipeline() {
  try {
    console.log("Initializing embedding pipeline...");
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/paraphrase-mpnet-base-v2');
    console.log("Embedding pipeline initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing embedding pipeline:", error);
    return {
      error: true,
      stage: "embedding_pipeline_init",
      message: error.message,
      stack: error.stack
    };
  }
}

async function getEmbedding(text) {
  try {
    console.log("Generating embedding for text:", text.substring(0, 50) + "...");
    if (!embeddingPipeline) {
      const initResult = await initializeEmbeddingPipeline();
      if (initResult !== true) return initResult;
    }
    
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    console.log("Embedding generated successfully, dimension:", output.data.length);
    return Array.from(output.data);
  } catch (error) {
    console.error("Error generating embedding:", error);
    return {
      error: true,
      stage: "embedding_generation",
      message: error.message,
      stack: error.stack
    };
  }
}

// Test direct HTTP connectivity to Qdrant
async function testQdrantConnectivity() {
  try {
    console.log("Testing direct HTTP connectivity to Qdrant...");
    const response = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: {
        'api-key': QDRANT_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log("Direct HTTP connection successful:", response.status);
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    console.error("Error connecting directly to Qdrant:", error);
    return {
      error: true,
      stage: "http_connectivity",
      status: error.response?.status,
      message: error.message,
      responseData: error.response?.data,
      stack: error.stack
    };
  }
}

// Test Qdrant client collection info
async function testQdrantClient() {
  try {
    console.log("Testing Qdrant client by getting collection info...");
    const collectionInfo = await qdrantClient.getCollection(COLLECTION_NAME);
    console.log("Qdrant client test successful");
    return {
      success: true,
      collectionInfo
    };
  } catch (error) {
    console.error("Error using Qdrant client:", error);
    return {
      error: true,
      stage: "qdrant_client",
      message: error.message,
      stack: error.stack
    };
  }
}

// Test search functionality
async function testQdrantSearch(query = "climate change") {
  try {
    console.log("Testing Qdrant search functionality with query:", query);
    
    // Get embedding for query
    const queryVector = await getEmbedding(query);
    if (queryVector.error) return queryVector;
    
    // Perform search
    console.log("Searching Qdrant with generated embedding...");
    const searchResult = await qdrantClient.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: 3,
      with_payload: true,
    });
    
    console.log("Search successful, found", searchResult.length, "results");
    return {
      success: true,
      resultsCount: searchResult.length,
      results: searchResult.map(result => ({
        id: result.id,
        score: result.score,
        payloadKeys: Object.keys(result.payload || {})
      }))
    };
  } catch (error) {
    console.error("Error performing Qdrant search:", error);
    return {
      error: true,
      stage: "qdrant_search",
      message: error.message,
      stack: error.stack
    };
  }
}

// Run all diagnostics
async function runDiagnostics() {
  console.log("=== STARTING QDRANT DIAGNOSTICS ===");
  console.log("Configuration:");
  console.log(`- Qdrant URL: ${QDRANT_URL}`);
  console.log(`- Collection: ${COLLECTION_NAME}`);
  console.log(`- API Key: ${QDRANT_API_KEY.substring(0, 4)}...${QDRANT_API_KEY.substring(QDRANT_API_KEY.length - 4)}`);
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    tests: {}
  };
  
  // Test 1: HTTP Connectivity
  results.tests.httpConnectivity = await testQdrantConnectivity();
  
  // Test 2: Qdrant Client
  results.tests.qdrantClient = await testQdrantClient();
  
  // Test 3: Embedding Pipeline
  results.tests.embeddingPipeline = await initializeEmbeddingPipeline();
  
  // Test 4: Search Functionality (only if previous tests passed)
  if (results.tests.embeddingPipeline === true && 
      results.tests.qdrantClient.success && 
      results.tests.httpConnectivity.success) {
    results.tests.search = await testQdrantSearch();
  } else {
    results.tests.search = { 
      skipped: true, 
      reason: "Previous tests failed" 
    };
  }
  
  console.log("=== DIAGNOSTICS COMPLETE ===");
  return results;
}

// API endpoints
app.get('/api/diagnose', async (req, res) => {
  try {
    const results = await runDiagnostics();
    res.json(results);
  } catch (error) {
    console.error('Error running diagnostics:', error);
    res.status(500).json({
      error: 'Failed to run diagnostics',
      message: error.message,
      stack: error.stack
    });
  }
});

app.get('/api/ping-qdrant', async (req, res) => {
  try {
    const result = await testQdrantConnectivity();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to ping Qdrant',
      message: error.message
    });
  }
});

app.post('/api/test-embedding', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const embedding = await getEmbedding(text);
    res.json({
      success: !embedding.error,
      result: embedding
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate embedding',
      message: error.message
    });
  }
});

app.post('/api/test-search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const searchResult = await testQdrantSearch(query);
    res.json(searchResult);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to search',
      message: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Qdrant diagnostic server running on port ${PORT}`);
  console.log(`Access the diagnostics at: http://localhost:${PORT}/api/diagnose`);
});

// Run diagnostics on startup
runDiagnostics().then(results => {
  console.log(JSON.stringify(results, null, 2));
}).catch(error => {
  console.error('Failed to run initial diagnostics:', error);
});

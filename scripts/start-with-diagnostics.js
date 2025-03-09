import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { QdrantClient } from "@qdrant/js-client-rest";
import { pipeline } from '@xenova/transformers';
import axios from 'axios';

// Qdrant client configuration
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
    console.log("[STARTUP] Initializing embedding pipeline...");
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/paraphrase-mpnet-base-v2');
    console.log("[STARTUP] Embedding pipeline initialized successfully");
    return { success: true };
  } catch (error) {
    console.error("[STARTUP] Error initializing embedding pipeline:", error);
    console.error("[STARTUP] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
    console.log("[STARTUP] Generating embedding for text:", text.substring(0, 50) + "...");
    if (!embeddingPipeline) {
      const initResult = await initializeEmbeddingPipeline();
      if (initResult.error) return initResult;
    }
    
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    console.log("[STARTUP] Embedding generated successfully, dimension:", output.data.length);
    return { success: true, embedding: Array.from(output.data) };
  } catch (error) {
    console.error("[STARTUP] Error generating embedding:", error);
    console.error("[STARTUP] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
    console.log("[STARTUP] Testing direct HTTP connectivity to Qdrant...");
    const response = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: {
        'api-key': QDRANT_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log("[STARTUP] Direct HTTP connection successful:", response.status);
    return {
      success: true,
      status: response.status
    };
  } catch (error) {
    console.error("[STARTUP] Error connecting directly to Qdrant:", error);
    console.error("[STARTUP] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      error: true,
      stage: "http_connectivity",
      status: error.response?.status,
      message: error.message
    };
  }
}

// Test Qdrant client collection info
async function testQdrantClient() {
  try {
    console.log("[STARTUP] Testing Qdrant client by getting collection info...");
    const collectionInfo = await qdrantClient.getCollection(COLLECTION_NAME);
    console.log("[STARTUP] Qdrant client test successful");
    return {
      success: true
    };
  } catch (error) {
    console.error("[STARTUP] Error using Qdrant client:", error);
    console.error("[STARTUP] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      error: true,
      stage: "qdrant_client",
      message: error.message
    };
  }
}

// Test search functionality
async function testQdrantSearch(query = "climate change") {
  try {
    console.log("[STARTUP] Testing Qdrant search functionality with query:", query);
    
    // Get embedding for query
    const embeddingResult = await getEmbedding(query);
    if (embeddingResult.error) return embeddingResult;
    
    // Perform search
    console.log("[STARTUP] Searching Qdrant with generated embedding...");
    const searchResult = await qdrantClient.search(COLLECTION_NAME, {
      vector: embeddingResult.embedding,
      limit: 3,
      with_payload: true,
    });
    
    console.log("[STARTUP] Search successful, found", searchResult.length, "results");
    return {
      success: true,
      resultsCount: searchResult.length
    };
  } catch (error) {
    console.error("[STARTUP] Error performing Qdrant search:", error);
    console.error("[STARTUP] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      error: true,
      stage: "qdrant_search",
      message: error.message
    };
  }
}

// Run diagnostics and then start the application
async function runStartupSequence() {
  console.log("\n=== RUNNING STARTUP DIAGNOSTICS ===\n");
  
  // Run essential tests first
  const connectivityResult = await testQdrantConnectivity();
  if (!connectivityResult.success) {
    console.error("[STARTUP] ❌ Failed to connect to Qdrant server. Check your network and configuration.");
    console.error("[STARTUP] Details:", JSON.stringify(connectivityResult));
    startNuxtAnyway();
    return;
  }
  console.log("[STARTUP] ✅ Qdrant HTTP connectivity check passed");
  
  const clientResult = await testQdrantClient();
  if (!clientResult.success) {
    console.error("[STARTUP] ❌ Failed to use Qdrant client API. Check your API key and permissions.");
    console.error("[STARTUP] Details:", JSON.stringify(clientResult));
    startNuxtAnyway();
    return;
  }
  console.log("[STARTUP] ✅ Qdrant client API check passed");
  
  const embeddingResult = await initializeEmbeddingPipeline();
  if (!embeddingResult.success) {
    console.error("[STARTUP] ❌ Failed to initialize embedding pipeline. Vector search will not work.");
    console.error("[STARTUP] Details:", JSON.stringify(embeddingResult));
    startNuxtAnyway();
    return;
  }
  console.log("[STARTUP] ✅ Embedding pipeline initialized successfully");
  
  const searchResult = await testQdrantSearch();
  if (!searchResult.success) {
    console.error("[STARTUP] ❌ Failed to perform search test. Vector search may not work correctly.");
    console.error("[STARTUP] Details:", JSON.stringify(searchResult));
    startNuxtAnyway();
    return;
  }
  console.log("[STARTUP] ✅ Search test passed, found", searchResult.resultsCount, "results");
  
  console.log("\n✅ ALL DIAGNOSTICS PASSED! Starting Nuxt application...\n");
  startNuxt();
}

function startNuxt() {
  const nuxt = spawn('nuxt', ['start'], {
    stdio: 'inherit',
    shell: true
  });
  
  nuxt.on('close', (code) => {
    console.log(`Nuxt process exited with code ${code}`);
    process.exit(code);
  });
}

function startNuxtAnyway() {
  console.log("\n⚠️ Starting Nuxt despite diagnostic failures...\n");
  startNuxt();
}

// Start the sequence
runStartupSequence().catch(error => {
  console.error("[STARTUP] Uncaught error during startup:", error);
  startNuxtAnyway();
});

import { spawn } from 'child_process';
import { QdrantClient } from "@qdrant/js-client-rest";
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

// Test text-based search functionality
async function testQdrantSearch(query = "climate change") {
  try {
    console.log("[STARTUP] Testing Qdrant text search functionality with query:", query);
    
    // Prepare filter
    let filter = {};
    
    // Get documents from collection with pagination
    const scrollRequest = {
      limit: 100, // Get documents in batches
      with_payload: true,
      filter: filter
    };
    
    // Get first batch
    console.log("[STARTUP] Retrieving documents for text search...");
    let scrollResult = await qdrantClient.scroll(COLLECTION_NAME, scrollRequest);
    let allDocuments = scrollResult.points;
    
    // Limit to 100 documents for startup test
    if (allDocuments.length > 100) {
      allDocuments = allDocuments.slice(0, 100);
    }
    
    console.log(`[STARTUP] Retrieved ${allDocuments.length} documents for text search`);
    
    // Simple text matching function
    const queryTerms = query.toLowerCase().split(/\s+/);
    const scoredDocuments = allDocuments.map(doc => {
      const text = (doc.payload.text || doc.payload.content || "").toLowerCase();
      
      // Calculate a simple relevance score based on term frequency
      let score = 0;
      queryTerms.forEach(term => {
        const regex = new RegExp(term, 'g');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length;
        }
      });
      
      return {
        id: doc.id,
        score: score,
        payload: doc.payload
      };
    });
    
    // Sort by score and take top results
    const results = scoredDocuments
      .filter(doc => doc.score > 0) // Only include documents with matches
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, 3); // Take top 3 results
    
    console.log(`[STARTUP] Text search successful, found ${results.length} relevant results`);
    return {
      success: true,
      resultsCount: results.length
    };
  } catch (error) {
    console.error("[STARTUP] Error performing Qdrant text search:", error);
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
  
  const searchResult = await testQdrantSearch();
  if (!searchResult.success) {
    console.error("[STARTUP] ❌ Failed to perform text search test. Vector search may not work correctly.");
    console.error("[STARTUP] Details:", JSON.stringify(searchResult));
    startNuxtAnyway();
    return;
  }
  console.log("[STARTUP] ✅ Text search test passed, found", searchResult.resultsCount, "results");
  
  console.log("\n✅ ALL DIAGNOSTICS PASSED! Starting Nuxt application...\n");
  startNuxt();
}

function startNuxt() {
  console.log("\n[STARTUP] Checking if application has been built...");
  
  // First try to run in production mode, if it fails, fall back to dev mode
  const nuxt = spawn('npm', ['run', 'start:original'], {
    stdio: 'inherit',
    shell: true
  });
  
  nuxt.on('error', (error) => {
    console.error(`[STARTUP] Error starting Nuxt in production mode:`, error);
    console.log(`[STARTUP] Falling back to development mode...`);
    startNuxtDev();
  });
  
  nuxt.on('close', (code) => {
    if (code !== 0) {
      console.log(`[STARTUP] Nuxt production start failed with code ${code}`);
      console.log(`[STARTUP] Falling back to development mode...`);
      startNuxtDev();
    } else {
      console.log(`[STARTUP] Nuxt process exited with code ${code}`);
      process.exit(code);
    }
  });
}

function startNuxtDev() {
  console.log("[STARTUP] Starting Nuxt in development mode...");
  const nuxtDev = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true
  });
  
  nuxtDev.on('close', (code) => {
    console.log(`[STARTUP] Nuxt dev process exited with code ${code}`);
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

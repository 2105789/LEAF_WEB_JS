import { QdrantClient } from "@qdrant/js-client-rest"
import { pipeline } from '@xenova/transformers'
import axios from 'axios'

// Qdrant client configuration - same as in chat.js
const QDRANT_URL = "https://1f924b4d-5cfa-4e17-9709-e7683b563598.europe-west3-0.gcp.cloud.qdrant.io:6333"
const QDRANT_API_KEY = "Nygu4XKFKDhPxO47WOuaY_g2YsX3XTFacn39AvxaeOwtZ2Qnjbh46A"
const COLLECTION_NAME = "leaf_data_v2"

// Initialize client
const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY
})

// Initialize embedding pipeline
let embeddingPipeline

async function initializeEmbeddingPipeline() {
  try {
    console.log("Initializing embedding pipeline...")
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/paraphrase-mpnet-base-v2')
    console.log("Embedding pipeline initialized successfully")
    return { success: true }
  } catch (error) {
    console.error("Error initializing embedding pipeline:", error)
    return {
      error: true,
      stage: "embedding_pipeline_init",
      message: error.message,
      stack: error.stack
    }
  }
}

async function getEmbedding(text) {
  try {
    console.log("Generating embedding for text:", text.substring(0, 50) + "...")
    if (!embeddingPipeline) {
      const initResult = await initializeEmbeddingPipeline()
      if (initResult.error) return initResult
    }
    
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    })
    
    console.log("Embedding generated successfully, dimension:", output.data.length)
    return { success: true, embedding: Array.from(output.data) }
  } catch (error) {
    console.error("Error generating embedding:", error)
    return {
      error: true,
      stage: "embedding_generation",
      message: error.message,
      stack: error.stack
    }
  }
}

// Test direct HTTP connectivity to Qdrant
async function testQdrantConnectivity() {
  try {
    console.log("Testing direct HTTP connectivity to Qdrant...")
    const response = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: {
        'api-key': QDRANT_API_KEY,
        'Content-Type': 'application/json'
      }
    })
    
    console.log("Direct HTTP connection successful:", response.status)
    return {
      success: true,
      status: response.status,
      data: response.data
    }
  } catch (error) {
    console.error("Error connecting directly to Qdrant:", error)
    return {
      error: true,
      stage: "http_connectivity",
      status: error.response?.status,
      message: error.message,
      responseData: error.response?.data,
      stack: error.stack
    }
  }
}

// Test Qdrant client collection info
async function testQdrantClient() {
  try {
    console.log("Testing Qdrant client by getting collection info...")
    const collectionInfo = await qdrantClient.getCollection(COLLECTION_NAME)
    console.log("Qdrant client test successful")
    return {
      success: true,
      collectionInfo
    }
  } catch (error) {
    console.error("Error using Qdrant client:", error)
    return {
      error: true,
      stage: "qdrant_client",
      message: error.message,
      stack: error.stack
    }
  }
}

// Test search functionality
async function testQdrantSearch(query = "climate change") {
  try {
    console.log("Testing Qdrant search functionality with query:", query)
    
    // Get embedding for query
    const embeddingResult = await getEmbedding(query)
    if (embeddingResult.error) return embeddingResult
    
    // Perform search
    console.log("Searching Qdrant with generated embedding...")
    const searchResult = await qdrantClient.search(COLLECTION_NAME, {
      vector: embeddingResult.embedding,
      limit: 3,
      with_payload: true,
    })
    
    console.log("Search successful, found", searchResult.length, "results")
    return {
      success: true,
      resultsCount: searchResult.length,
      results: searchResult.map(result => ({
        id: result.id,
        score: result.score,
        payloadKeys: Object.keys(result.payload || {})
      }))
    }
  } catch (error) {
    console.error("Error performing Qdrant search:", error)
    return {
      error: true,
      stage: "qdrant_search",
      message: error.message,
      stack: error.stack
    }
  }
}

// Run all diagnostics
async function runDiagnostics() {
  console.log("=== STARTING QDRANT DIAGNOSTICS ===")
  console.log("Configuration:")
  console.log(`- Qdrant URL: ${QDRANT_URL}`)
  console.log(`- Collection: ${COLLECTION_NAME}`)
  console.log(`- API Key: ${QDRANT_API_KEY.substring(0, 4)}...${QDRANT_API_KEY.substring(QDRANT_API_KEY.length - 4)}`)
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    tests: {}
  }
  
  // Test 1: HTTP Connectivity
  results.tests.httpConnectivity = await testQdrantConnectivity()
  
  // Test 2: Qdrant Client
  results.tests.qdrantClient = await testQdrantClient()
  
  // Test 3: Embedding Pipeline
  results.tests.embeddingPipeline = await initializeEmbeddingPipeline()
  
  // Test 4: Search Functionality (only if previous tests passed)
  if (results.tests.embeddingPipeline.success && 
      results.tests.qdrantClient.success &&
      results.tests.httpConnectivity.success) {
    results.tests.search = await testQdrantSearch()
  } else {
    results.tests.search = { 
      skipped: true, 
      reason: "Previous tests failed" 
    }
  }
  
  console.log("=== DIAGNOSTICS COMPLETE ===")
  return results
}

// Run diagnostics when this file is executed directly
runDiagnostics().then(results => {
  console.log(JSON.stringify(results, null, 2))
}).catch(error => {
  console.error('Error running diagnostics:', error)
})

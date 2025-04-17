import { PrismaClient } from '@prisma/client'
import { getCookie } from 'h3'
import jwt from 'jsonwebtoken'
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { tavily } from "@tavily/core"
import { QdrantClient } from "@qdrant/js-client-rest"
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import axios from 'axios'
import leafConfig from '../config/leaf-config.json'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleGenerativeAIStream, StreamingTextResponse } from 'ai'
import { getToken } from 'next-auth/jwt'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import { useRuntimeConfig } from '#imports'

const prisma = new PrismaClient()
const runtimeConfig = useRuntimeConfig()

// Model configurations
const MODEL_CONFIG = {
  router: {
    name: "gemini-2.0-flash-lite",
    temperature: 0.1
  },
  assistant: {
    name: "gemini-2.0-flash-lite",
    temperature: 0.3
  },
  final: {
    name: "gemini-2.0-flash-exp",
    temperature: 0.4
  }
}

// Initialize Tavily client
let tavilyClient = null

// In-memory cache for active conversations
const conversationCache = new Map()

// Cache for vector search results
const vectorResultsCache = new Map()

// Cache for web sources
const webSourcesGlobalCache = new Map()

// Qdrant client configuration
const QDRANT_URL = runtimeConfig.qdrantUrl
const QDRANT_API_KEY = runtimeConfig.qdrantApiKey
const COLLECTION_NAME = "leaf_data_v2"

const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY
})

// Add detailed logging for Qdrant connection
try {
  console.log("[SETUP] Initializing Qdrant client with URL:", QDRANT_URL)
  // Test connection on startup
  qdrantClient.getCollections().then(() => {
    console.log("[SETUP] Successfully connected to Qdrant")
  }).catch(err => {
    console.error("[SETUP] Failed to connect to Qdrant on startup:", err.message)
    console.error("[SETUP] Error details:", JSON.stringify(err, Object.getOwnPropertyNames(err)))
    console.error("[SETUP] Full error stack:", err.stack)
  })
} catch (error) {
  console.error("[SETUP] Error initializing Qdrant client:", error.message)
  console.error("[SETUP] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
  console.error("[SETUP] Full error stack:", error.stack)
}

// Search Qdrant for relevant chunks using text search instead of vector search
async function searchQdrant(query, sourceFilter = null, limit = 5) {
  try {
    console.log(`[QDRANT] Searching Qdrant collection '${COLLECTION_NAME}' for query: ${query.substring(0, 50)}...`)
    console.log(`[QDRANT] Parameters: sourceFilter=${sourceFilter}, limit=${limit}`)
    
    // Instead of vector search, we'll perform a text-based search
    console.log("[QDRANT] Performing text-based search...")
    
    // Prepare filter
    let filter = {};
    
    if (sourceFilter) {
      filter = { 
        must: [
          { key: "source", match: { value: sourceFilter } }
        ]
      };
    }
    
    // Get all documents from collection with pagination
    // Since Qdrant doesn't have native text search, we'll retrieve documents and filter them
    const scrollRequest = {
      limit: 100, // Get documents in batches
      with_payload: true,
      filter: filter
    };
    
    // Get first batch
    let scrollResult = await qdrantClient.scroll(COLLECTION_NAME, scrollRequest);
    let allDocuments = scrollResult.points;
    
    // Continue scrolling if there are more documents
    while (scrollResult.next_page_offset) {
      scrollRequest.offset = scrollResult.next_page_offset;
      scrollResult = await qdrantClient.scroll(COLLECTION_NAME, scrollRequest);
      allDocuments = [...allDocuments, ...scrollResult.points];
      
      // Limit to 1000 documents max to avoid excessive processing
      if (allDocuments.length > 8000) {
        console.log("[QDRANT] Reached maximum document limit (8000) for text search");
        break;
      }
    }
    
    console.log(`[QDRANT] Retrieved ${allDocuments.length} documents for text search`);
    
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
      .slice(0, limit); // Take top N results
    
    console.log(`[QDRANT] Text search successful, found ${results.length} relevant results`);
    
    return results.map(result => ({
      id: result.id,
      source: result.payload.source,
      filePath: result.payload.file_path || `data\\${result.payload.source}.pdf`,
      chunkIndex: result.payload.chunk_index,
      text: result.payload.text || result.payload.content,
      score: result.score,
    }));
  } catch (error) {
    console.error("[QDRANT] Error searching Qdrant:", error.message)
    console.error("[QDRANT] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
    console.error("[QDRANT] Full error stack:", error.stack)
    
    // Fallback to empty results
    console.log("[QDRANT] Returning empty results due to search error");
    return []
  }
}

// Helper function to get conversation context
async function getConversationContext(threadId, prisma, limit = 5) {
  const recentMessages = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      role: true,
      content: true,
      createdAt: true
    }
  })
  return recentMessages.reverse()
}

// Function to determine optimal search parameters based on query
async function determineSearchParameters(query, geminiApiKey, mode = 'detailed', includeImages = true) {
  // Use parameters based on mode and image settings
  const params = {
    searchDepth: "advanced",
    includeAnswer: "advanced",
    includeImages: mode === 'concise' ? false : includeImages,
    includeImageDescriptions: mode === 'concise' ? false : includeImages,
    includeRawContent: true,
    maxResults: mode === 'concise' ? 5 : 10 // Reduce results for concise mode
  };
  
  console.log("[SEARCH_PARAMS] Using parameters:", JSON.stringify(params, null, 2));
  return params;
}

// Helper function to initialize Tavily
function initTavily(apiKey) {
  if (!tavilyClient && apiKey) {
    try {
      console.log("[TAVILY] Initializing Tavily client...")
      tavilyClient = tavily({ apiKey: apiKey })
      console.log("[TAVILY] Tavily client initialized successfully")
      return true
    } catch (error) {
      console.error('[TAVILY] Failed to initialize Tavily client:', error.message)
      console.error("[TAVILY] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
      console.error("[TAVILY] Full error stack:", error.stack)
      return false
    }
  }
  return !!tavilyClient
}

// Function to check if query is related to climate change or is a valid conversational query
async function isClimateRelated(query, geminiApiKey) {
  const topicModel = new ChatGoogleGenerativeAI({
    apiKey: geminiApiKey,
    model: "gemini-2.0-flash-lite",
    temperature: 0,
    maxRetries: 2,
  })

  const topicPrompt = `
Analyze this query and determine if it falls into one of these categories:
1. CLIMATE: Related to climate change, environmental sustainability, climate-related organizations, energy, emissions, biodiversity, conservation, pollution, natural resources, climate policy, sustainable development, or environmental technologies. This includes organizations like UNFCCC, IPCC, APCTT, or any entity working on climate/environmental issues.
2. CONVERSATION: Basic conversation, context questions, or task-related queries (like summarizing PDFs, asking about previous discussions)
3. OTHER: Completely unrelated topics like fictional entertainment, sports, or personal relationships that have no connection to climate or environment.

Query: "${query}"

Return ONLY "CLIMATE", "CONVERSATION", or "OTHER".`

  try {
    console.log("[TOPIC] Determining topic for query:", query.substring(0, 50) + "...")
    const topicResponse = await topicModel.invoke([["human", topicPrompt]])
    const result = topicResponse.content.trim().toUpperCase()
    console.log("[TOPIC] Determined topic:", result)
    return { 
      isValid: result === "CLIMATE" || result === "CONVERSATION",
      type: result
    }
  } catch (error) {
    console.error("[TOPIC] Error checking query type:", error.message)
    console.error("[TOPIC] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
    console.error("[TOPIC] Full error stack:", error.stack)
    return { isValid: true, type: "CONVERSATION" }
  }
}

// Create a router model to classify the query type
async function routeQuery(query, geminiApiKey) {
  const routerModel = new ChatGoogleGenerativeAI({
    apiKey: geminiApiKey,
    model: "gemini-2.0-flash-lite",
    temperature: 0,
    maxRetries: 2,
  })

  const routerPrompt = `
Classify the following user query into EXACTLY ONE of these categories:
1. CASUAL_CONVERSATION: Simple greetings, chitchat, or personal exchanges
2. RESEARCH_QUESTION: Questions that require factual information, data, studies, citations, recent information, sources, or images. This includes questions about organizations, technologies, policies, events, or people related to climate/environment, even if they don't explicitly mention climate change.
3. GENERAL_QUESTION: Other climate or environmental questions that don't require extensive citations or research

Be inclusive in your classification - if the query mentions ANY organization, technology, or concept that could be connected to climate, sustainability, environment, or green initiatives, classify it as RESEARCH_QUESTION or GENERAL_QUESTION, not CASUAL_CONVERSATION.

For example, questions about APCTT, sustainable technologies, green energy, pollution, conservation, biodiversity, or similar topics should be classified as RESEARCH_QUESTION or GENERAL_QUESTION, not CASUAL_CONVERSATION.

Query: "${query}"

Return ONLY the category name, nothing else. No explanations.`

  try {
    console.log("[ROUTER] Routing query:", query.substring(0, 50) + "...")
    const routerResponse = await routerModel.invoke([["human", routerPrompt]])
    const classification = routerResponse.content.trim().toUpperCase()
    console.log("[ROUTER] Classified query:", classification)
    if (classification.includes("CASUAL")) return "CASUAL_CONVERSATION"
    if (classification.includes("RESEARCH")) return "RESEARCH_QUESTION"
    return "GENERAL_QUESTION"
  } catch (error) {
    console.error("[ROUTER] Error in query routing:", error.message)
    console.error("[ROUTER] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
    console.error("[ROUTER] Full error stack:", error.stack)
    return "GENERAL_QUESTION"
  }
}

// Function to extract and format sources from search results
function extractSourcesFromTavily(searchResults) {
  if (!searchResults || !searchResults.results || !Array.isArray(searchResults.results)) {
    console.error("[TAVILY] Invalid search results structure", searchResults)
    return { webSources: [], imageSources: [] }
  }

  // Helper function to extract date indicators from text
  const extractDateIndicators = (text) => {
    if (!text) return null;
    
    try {
      // Look for year-month patterns (2024-10, 2023-03, etc.)
      const yearMonthPattern = /\b(20\d\d)[-\/](\d\d)\b/;
      // Look for month-year patterns (April-June 2024, Jan 2023, etc.)
      const monthYearPattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-\s](\d{4})\b/i;
      // Look for quarter patterns (Q1 2024, Q4 2023, etc.)
      const quarterPattern = /\bQ[1-4][-\s](20\d\d)\b/i;
      // Look for period patterns (April-June 2024, Jan-Mar 2023, etc.)
      const periodPattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-\s](to|through|thru|[-])[-\s]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-\s](20\d\d)\b/i;
      
      // Try to match each pattern
      const yearMonthMatch = text.match(yearMonthPattern);
      const monthYearMatch = text.match(monthYearPattern);
      const quarterMatch = text.match(quarterPattern);
      const periodMatch = text.match(periodPattern);
      
      // Return the first match found, with priority
      if (yearMonthMatch) return { year: yearMonthMatch[1], month: yearMonthMatch[2], text: yearMonthMatch[0] };
      if (monthYearMatch) return { year: monthYearMatch[2], month: monthYearMatch[1], text: monthYearMatch[0] };
      if (quarterMatch) return { year: quarterMatch[1], quarter: true, text: quarterMatch[0] };
      if (periodMatch) return { year: periodMatch[4], period: true, text: periodMatch[0] };
      
      // Look for just year as a fallback
      const yearMatch = text.match(/\b(20\d\d)\b/);
      if (yearMatch) return { year: yearMatch[1], text: yearMatch[0] };
    } catch (err) {
      console.error("[TAVILY] Error extracting date indicators:", err);
    }
    
    return null;
  };
  
  // Score recency based on date indicators
  const scoreRecency = (result) => {
    try {
      // Check title, URL and content for date indicators
      const titleDate = extractDateIndicators(result.title);
      const urlDate = extractDateIndicators(result.url);
      const contentDate = extractDateIndicators(result.content);
      
      // Use the most specific date found (prioritize content, then title, then URL)
      const dateInfo = contentDate || titleDate || urlDate;
      
      if (!dateInfo) {
        return 0;
      }
      
      // Calculate recency score - higher for more recent dates
      const currentYear = new Date().getFullYear();
      const yearDiff = currentYear - parseInt(dateInfo.year);
      
      // Base score on how recent the year is
      let recencyScore = 100 - (yearDiff * 30);
      
      // If we have month info, refine the score further
      if (dateInfo.month) {
        const currentMonth = new Date().getMonth() + 1; // 1-12
        
        // Convert month name to number if necessary
        let monthNum = dateInfo.month;
        if (isNaN(monthNum)) {
          const monthNames = {
            "jan": 1, "january": 1,
            "feb": 2, "february": 2,
            "mar": 3, "march": 3,
            "apr": 4, "april": 4,
            "may": 5,
            "jun": 6, "june": 6,
            "jul": 7, "july": 7,
            "aug": 8, "august": 8,
            "sep": 9, "september": 9,
            "oct": 10, "october": 10,
            "nov": 11, "november": 11,
            "dec": 12, "december": 12
          };
          monthNum = monthNames[dateInfo.month.toLowerCase()] || 1;
        }
        
        // If same year, refine by month
        if (yearDiff === 0) {
          recencyScore = 100 - ((currentMonth - monthNum) * 2); // Deduct 2 points per month older
        }
      }
      
      // Cap score between 0 and 100
      recencyScore = Math.max(0, Math.min(100, recencyScore));
      
      return recencyScore;
    } catch (err) {
      console.error("[TAVILY] Error calculating recency score:", err);
      return 0;
    }
  };

  try {
    // Add recency score to results
    const scoredResults = searchResults.results.map(result => ({
      ...result,
      recencyScore: scoreRecency(result)
    }));
    
    // Sort by recency score (higher first) then by original score
    const sortedResults = scoredResults.sort((a, b) => {
      // If recency scores differ significantly, prioritize recency
      if (Math.abs(a.recencyScore - b.recencyScore) > 20) {
        return b.recencyScore - a.recencyScore;
      }
      // Otherwise, use original score
      return b.score - a.score;
    });
    
    // Deduplicate results by URL while preserving order
    const uniqueUrls = new Set();
    const uniqueResults = [];
  
    for (const result of sortedResults) {
      if (result.url && !uniqueUrls.has(result.url)) {
        uniqueUrls.add(result.url);
        uniqueResults.push(result);
      }
    }
  
    // Format web sources with proper structure
    const webSources = uniqueResults.map((result, index) => {
      try {
        // Extract date information
        const dateInfo = extractDateIndicators(result.content) || 
                        extractDateIndicators(result.title) || 
                        extractDateIndicators(result.url);
        
        // Format the source entry
        const sourceEntry = {
          index: index + 1,
          title: result.title || "Untitled Source",
          url: result.url || "",
          content: [result.rawContent, result.content, result.content_snippet]
            .find(content => typeof content === 'string') || "",
          recencyScore: result.recencyScore,
          dateInfo: dateInfo ? dateInfo.text : null
        };
    
        return sourceEntry;
      } catch (err) {
        console.error("[TAVILY] Error formatting web source:", err);
        // Return a minimal valid source entry
        return {
          index: index + 1,
          title: result.title || "Untitled Source",
          url: result.url || "",
          content: "",
          recencyScore: 0,
          dateInfo: null
        };
      }
    });
  
    // Format image sources
    const imageSources = (searchResults.images || []).map((img, index) => {
      try {
        return {
          index: index + 1,
          url: img.url || "",
          description: img.description || `Image related to query`,
          sourceUrl: img.source_url || ""
        };
      } catch (err) {
        console.error("[TAVILY] Error formatting image source:", err);
        // Return a minimal valid image source
        return {
          index: index + 1,
          url: "",
          description: "Image (error parsing metadata)",
          sourceUrl: ""
        };
      }
    });
  
    console.log(`[TAVILY] Successfully processed ${webSources.length} web sources and ${imageSources.length} image sources`);
    return { webSources, imageSources };
  } catch (err) {
    console.error("[TAVILY] Critical error in extractSourcesFromTavily:", err);
    return { webSources: [], imageSources: [] };
  }
}

// Helper function to validate PDF data
function isPDFValid(buffer) {
  return buffer.slice(0, 5).toString() === '%PDF-'
}

// Helper function to convert base64 to buffer
function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64')
}

// Helper function to extract text from PDF
async function extractTextFromPDF(pdfBuffer) {
  try {
    const tempFilePath = join(tmpdir(), `temp_pdf_${Date.now()}.pdf`)
    writeFileSync(tempFilePath, pdfBuffer)
    
    const loader = new PDFLoader(tempFilePath, {
      splitPages: false
    })
    const docs = await loader.load()
    
    try {
      unlinkSync(tempFilePath)
    } catch (cleanupError) {
      console.warn('[PDF] Failed to clean up temporary PDF file:', cleanupError)
    }
    
    return docs.length > 0 ? docs[0].pageContent : ""
  } catch (error) {
    console.error('[PDF] Error extracting text from PDF:', error.message)
    console.error("[PDF] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
    console.error("[PDF] Full error stack:", error.stack)
    return ""
  }
}

// Helper function to clean markdown response
function cleanMarkdownResponse(response) {
  // Remove ```markdown at the start and ``` at the end if present
  return response.replace(/^```markdown\n/, '').replace(/\n```$/, '').trim()
}

// Helper function to ensure source blocks are properly formatted
function ensureProperSourceBlocks(response, threadId) {
  // First clean the response
  let cleaned = cleanMarkdownResponse(response);
  
  console.log('[SOURCE_BLOCKS] Ensuring proper source blocks formatting');
  
  // Check if source blocks are properly formatted
  const hasWebsources = cleaned.includes('<websources>') && cleaned.includes('</websources>');
  const hasImagesources = cleaned.includes('<imagesources>') && cleaned.includes('</imagesources>');
  const hasVectorsources = cleaned.includes('<vectorsources>') && cleaned.includes('</vectorsources>');
  
  // If all source blocks are present and properly formatted, return as is
  if (hasWebsources && hasImagesources && hasVectorsources) {
    console.log('[SOURCE_BLOCKS] Source blocks are properly formatted');
    return cleaned;
  }
  
  console.log('[SOURCE_BLOCKS] Some source blocks missing or improperly formatted');
  
  // Extract the references section (everything after "## References" or similar)
  const referencesSectionMatch = cleaned.match(/##\s*References[^#]*$/i);
  
  if (!referencesSectionMatch) {
    console.log('[SOURCE_BLOCKS] No references section found, adding one');
    // If no references section found, add one
    cleaned += '\n\n## References\n';
    // Get the web sources from cache if available
    const webSourcesCache = webSourcesGlobalCache.get(threadId) || [];
    
    // Format source blocks
    let sourceBlocks = "\n\n";
    
    // Add web sources block
    if (webSourcesCache.length > 0) {
      const formattedWebSources = webSourcesCache.map((source, idx) => 
        `[${idx + 1}] ${source.title || 'Untitled Source'} - ${source.url || 'No URL'}`
      ).join('\n');
      sourceBlocks += "<websources>\n" + formattedWebSources + "\n</websources>\n\n";
    } else {
      sourceBlocks += "<websources>\n</websources>\n\n";
    }
    
    // Add empty image sources and vector sources blocks
    sourceBlocks += "<imagesources>\n</imagesources>\n\n";
    sourceBlocks += "<vectorsources>\nNo vector sources available.\n</vectorsources>\n";
    
    return cleaned + sourceBlocks;
  }
  
  // Split the response into content and references
  const contentPart = cleaned.substring(0, referencesSectionMatch.index);
  let refPart = referencesSectionMatch[0];
  
  // Extract source blocks if they exist but are improperly formatted
  const websourcesMatch = refPart.match(/.*?<websources>([\s\S]*?)<\/websources>/m);
  const imagesourcesMatch = refPart.match(/.*?<imagesources>([\s\S]*?)<\/imagesources>/m);
  const vectorsourcesMatch = refPart.match(/.*?<vectorsources>([\s\S]*?)<\/vectorsources>/m);
  
  // Format the source blocks properly
  let sourceBlocks = "\n\n";
  
  if (websourcesMatch) {
    console.log('[SOURCE_BLOCKS] Found websources, validating...');
    // Deduplicate websources if needed
    const webSourcesContent = websourcesMatch[1].trim();
    // Check for URL patterns
    const urls = new Set();
    const uniqueLines = [];
    
    webSourcesContent.split('\n').forEach(line => {
      const urlMatch = line.match(/https?:\/\/[^\s)]+/);
      if (urlMatch && urlMatch[0]) {
        const url = urlMatch[0];
        if (!urls.has(url)) {
          urls.add(url);
          uniqueLines.push(line);
        }
      } else {
        // If no URL found, keep the line
        uniqueLines.push(line);
      }
    });
    
    // If we found and removed duplicates, reindex the references
    if (uniqueLines.length < webSourcesContent.split('\n').length) {
      console.log('[SOURCE_BLOCKS] Deduplicating and reindexing websources');
      const reindexedLines = uniqueLines.map((line, idx) => {
        return line.replace(/^\[\d+\]/, `[${idx + 1}]`);
      });
      sourceBlocks += "<websources>\n" + reindexedLines.join('\n') + "\n</websources>\n\n";
    } else {
      sourceBlocks += "<websources>\n" + webSourcesContent + "\n</websources>\n\n";
    }
  } else {
    console.log('[SOURCE_BLOCKS] No websources found, checking cache');
    // Try to get web sources from cache
    const webSourcesCache = webSourcesGlobalCache.get(threadId) || [];
    console.log('[SOURCE_BLOCKS] Web sources from cache:', webSourcesCache.length);
    
    if (webSourcesCache.length > 0) {
      console.log('[SOURCE_BLOCKS] Creating websources from cache');
      // Create websources block with cached sources
      const formattedWebSources = webSourcesCache.map((source, idx) => 
        `[${idx + 1}] ${source.title || 'Untitled Source'} - ${source.url || 'No URL'}`
      ).join('\n');
      sourceBlocks += "<websources>\n" + formattedWebSources + "\n</websources>\n\n";
    } else {
      // Add empty websources block if missing
      sourceBlocks += "<websources>\n</websources>\n\n";
    }
  }
  
  if (imagesourcesMatch) {
    sourceBlocks += "<imagesources>\n" + imagesourcesMatch[1].trim() + "\n</imagesources>\n\n";
  } else {
    // Add empty imagesources block if missing
    sourceBlocks += "<imagesources>\n</imagesources>\n\n";
  }
  
  if (vectorsourcesMatch) {
    sourceBlocks += "<vectorsources>\n" + vectorsourcesMatch[1].trim() + "\n</vectorsources>\n";
  } else {
    // Try to get vector results from cache
    const vectorResults = vectorResultsCache.get(threadId) || [];
    console.log("[SOURCE_BLOCKS] Creating vector sources from cache. Results:", vectorResults.length);
    
    // Create vector sources block with text excerpts
    const vectorReferences = vectorResults.length > 0 ? 
      vectorResults.map((s, idx) => 
        `[V${idx + 1}] ${s.source || 'Unknown Source'} - Chunk ${s.chunkIndex || 'N/A'} - ${s.filePath || 'Unknown Path'}
Text excerpt: "${(s.text || '').substring(0, 300)}${(s.text || '').length > 300 ? '...' : ''}"`
      ).join('\n\n') : 'No vector sources available.';
    
    sourceBlocks += "<vectorsources>\n" + vectorReferences + "\n</vectorsources>\n";
  }
  
  // Rebuild the response with fixed source blocks
  return contentPart + refPart.split('<websources>')[0] + sourceBlocks;
}

// Function to generate additional search queries for more comprehensive Tavily search
async function generateSearchQueries(userQuery, geminiApiKey) {
  // Only use the original query for all searches
  //console.log("[SEARCH_QUERIES] Using only original query for all searches:", userQuery);
  return [userQuery];
}

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'POST') {
    event.res.statusCode = 405
    return { error: 'Method not allowed' }
  }

  // Verify authentication
  const token = getCookie(event, 'auth_token')
  if (!token) {
    event.res.statusCode = 401
    return { error: 'Unauthorized' }
  }

  try {
    const decoded = jwt.verify(token, runtimeConfig.jwtSecret)
    const body = await readBody(event)
    const { 
      threadId, 
      message, 
      pdfContext,
      enableWebSearch = true,
      mode = 'detailed',
      includeImages = true
    } = body

    if (!threadId || !message) {
      event.res.statusCode = 400
      return { error: 'ThreadId and message are required' }
    }

    console.log("==============================================");
    console.log(`[CHAT_API] Processing new message: "${message}"`);
    console.log(`[CHAT_API] Thread ID: ${threadId}`);
    console.log(`[CHAT_API] Web Search Enabled: ${enableWebSearch}`);
    console.log(`[CHAT_API] PDF Context Present: ${!!pdfContext}`);
    console.log(`[CHAT_API] Response Mode: ${mode}`);
    console.log(`[CHAT_API] Include Images: ${includeImages}`);
    console.log("==============================================");

    // Verify thread ownership and get thread with its messages
    const thread = await prisma.thread.findFirst({
      where: {
        id: threadId,
        userId: decoded.id
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true, createdAt: true }
        }
      }
    })

    if (!thread) {
      event.res.statusCode = 404
      return { error: 'Thread not found' }
    }

    try {
      // First, save the user's message to the database
      const userMessage = await prisma.message.create({
        data: {
          content: message,
          role: 'user',
          threadId,
          userId: decoded.id
        }
      })

      let aiResponse = ''
      let processingState = 'initializing'
      let webSearchResults = null
      let referenceMap = {}
      let referencesSection = ""
      
      // Process PDF if provided
      let pdfContent = ""
      if (pdfContext) {
        try {
          const buffer = base64ToBuffer(pdfContext)
          if (!isPDFValid(buffer)) {
            throw new Error('Invalid PDF format')
          }
          pdfContent = await extractTextFromPDF(buffer)
          console.log('[PDF] Successfully extracted PDF content:', pdfContent.slice(0, 200) + '...')
        } catch (error) {
          console.error('[PDF] Error processing PDF:', error)
        }
      }

      // Initialize Tavily if needed
      if (enableWebSearch) {
        initTavily(runtimeConfig.tavilyApiKey)
      }

      // Check query type and get conversation context
      const { isValid, type } = await isClimateRelated(message, runtimeConfig.geminiApiKey)
      const conversationContext = await getConversationContext(threadId, prisma)
      
      if (!isValid) {
        aiResponse = `I'm Leaf, an AI assistant specialized in climate change and environmental sustainability. While I can help with general conversations and tasks, I'd be most helpful discussing climate-related topics. How can I assist you today?`
        
        const savedMessage = await prisma.message.create({
          data: {
            content: aiResponse,
            role: 'assistant',
            threadId,
            userId: decoded.id,
            parentMsgId: userMessage.id
          }
        })
        
        return { 
          messages: [userMessage, savedMessage],
          processingState: 'general-conversation'
        }
      }

      // Determine the query type for better routing
      const queryType = await routeQuery(message, runtimeConfig.geminiApiKey)
      console.log("[HANDLER] Query type determined:", queryType)

      // Route the query based on type, context, and query type
      if (type === "CONVERSATION" && queryType === "CASUAL_CONVERSATION") {
        processingState = 'conversation'
        
        const leafLiteModel = new ChatGoogleGenerativeAI({
          apiKey: runtimeConfig.geminiApiKey,
          model: "gemini-2.0-flash-lite",
          temperature: 0.3,
          maxRetries: 2,
        })

        const contextPrompt = `
You are Leaf, a helpful AI assistant with expertise in climate change and environmental sustainability.
While your primary focus is climate-related topics, you can also engage in general conversation and help with basic tasks.

Recent conversation context:
${conversationContext.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Current query: ${message}

${pdfContent ? `There is also a PDF document provided with the following content:
${pdfContent.slice(0, 8000)}...` : ''}

Respond naturally to the query, taking into account the conversation context and any provided PDF content.
If the query is about previous discussions, summarize the relevant points from the conversation context.
If it's about a PDF, focus on providing a clear summary or answering specific questions about its content.
Always maintain a helpful and engaging tone while subtly encouraging climate-related discussions when appropriate.

IMPORTANT: Do not wrap your response in markdown code blocks. Use markdown formatting (**, *, #, ##) directly in your response.`

        const response = await leafLiteModel.invoke([
          ["system", "You are Leaf, maintaining a balance between climate expertise and general helpfulness. Format responses with markdown but do not use code blocks."],
          ["human", contextPrompt]
        ])
        
        aiResponse = cleanMarkdownResponse(response.content)
        
      } else {
        processingState = 'research-pipeline'
        console.log('[RESEARCH_PIPELINE] Starting research pipeline processing...')
        
        // Get search parameters
        const searchParams = await determineSearchParameters(
          message,
          runtimeConfig.geminiApiKey,
          mode,
          includeImages
        );
        console.log('[RESEARCH_PIPELINE] Search parameters determined:', searchParams)
        
        const searchOptions = {
          ...searchParams,
          includeDomains: [
            // Climate science and research domains
            "nature.com", "science.org", "sciencedirect.com", "pnas.org", "ipcc.ch",
            "nasa.gov/climate", "climate.gov", "carbonbrief.org", "unfccc.int",
            "climatecentral.org", "realclimate.org", "skepticalscience.com",
            "climatefeedback.org", "grist.org", "insideclimatenews.org",
            "yaleclimateconnections.org", "nytimes.com/section/climate",
            "theguardian.com/environment/climate-crisis", "bbc.com/future/tags/climate_change",
            "climatechangenews.com", "sciencebasedtargets.org", "wri.org",
            "worldbank.org/en/topic/climatechange", "epa.gov/climate-change",
            "globalchange.gov", "climate.mit.edu", "journals.ametsoc.org",
            "scienceadvances.org", "iopscience.iop.org/journal/1748-9326",
            "c2es.org", "climateworks.org", "climatepolicy.org",
            "climatejusticealliance.org", "350.org", "climaterealityproject.org",
            "noaa.gov/climate", "cdp.net", "ceres.org", "climateactiontracker.org",
            "climatenexus.org",
            
            // Organizations and governmental bodies
            "apctt.org", "apctt-escap.org", "unescap.org", "unenvironment.org", 
            "unep.org", "iea.org", "irena.org", "iucn.org", "wwf.org",
            "greenpeace.org", "weforum.org", "unido.org", "unece.org",
            "undp.org", "adb.org", "worldbank.org", "imf.org",
            "adaptation-fund.org", "gcfund.org", "ctcn.org", "forestcarbonpartnership.org",
            "fao.org", "who.int/health-topics/climate-change", 
            "wmo.int", "undrr.org", "unocha.org", "icann.org",
            
            // APCTT specific domains
            "apctt.org/techmonitor", "apctt.org/events", "apctt.org/publications",
            "apctt.org/climate-tech", "apctt.org/technology-transfer",
            "apctt.org/capacity-building", "apctt.org/news",
            
            // Regional and local climate organizations
            "escap.un.org", "asiapacific.unwomen.org", "asean.org", 
            "aseanenergy.org", "apec.org", "saarc-energy.org",
            "apccc.org", "pacificclimatechange.net", "sprep.org",
            "preventionweb.net", "adaptation-undp.org", "apan-gan.net"
          ],
        }

        // Perform web search
        if (enableWebSearch && tavilyClient) {
          console.log('[RESEARCH_PIPELINE] Starting Tavily web search...')
          console.log('[RESEARCH_PIPELINE] Original user query:', message)
          try {
            // Generate search query
            const searchQueries = await generateSearchQueries(message, runtimeConfig.geminiApiKey);
            console.log('[RESEARCH_PIPELINE] Generated search query:', searchQueries[0]);
            
            console.log(`[RESEARCH_PIPELINE] Running Tavily search with query: "${searchQueries[0]}"`);
            //console.log(`[RESEARCH_PIPELINE] Search options:`, JSON.stringify(searchOptions, null, 2));
            
            try {
              // Run a single search with the original query
              const queryResults = await tavilyClient.search(searchQueries[0], searchOptions);
              
              //console.log(`[RESEARCH_PIPELINE] Tavily search completed with ${queryResults.results?.length || 0} results and ${queryResults.images?.length || 0} images`);
              //console.log(`[RESEARCH_PIPELINE] RAW RESULTS:`, JSON.stringify(queryResults, null, 2));
              
              webSearchResults = queryResults;
              
              //console.log("[RESEARCH_PIPELINE] Tavily search completed successfully with", 
                          //queryResults.results?.length || 0, "results and", queryResults.images?.length || 0, "images");
            } catch (queryError) {
              console.error(`[RESEARCH_PIPELINE] Error in Tavily search:`, queryError);
              webSearchResults = { results: [], images: [] };
            }
            
          } catch (searchError) {
            console.error("[RESEARCH_PIPELINE] Error in Tavily search process:", searchError)
            webSearchResults = { results: [], images: [] }
          }
        } else {
          console.log('[RESEARCH_PIPELINE] Web search skipped - enableWebSearch:', enableWebSearch, 'tavilyClient:', !!tavilyClient)
        }

        console.log('[RESEARCH_PIPELINE] Extracting sources from search results...')
        // Extract web and image sources from search results
        let webSources = [], imageSources = [];
        
        try {
          const extractedSources = extractSourcesFromTavily(webSearchResults);
          webSources = extractedSources.webSources || [];
          imageSources = extractedSources.imageSources || [];
          
          console.log(`[RESEARCH_PIPELINE] Extracted ${webSources.length} web sources and ${imageSources.length} image sources`);
        } catch (error) {
          console.error('[RESEARCH_PIPELINE] Error extracting sources from search results:', error);
          webSources = [];
          imageSources = [];
        }
        
        // Store web sources in global cache for recovery if needed
        webSourcesGlobalCache.set(threadId, webSources);
        console.log(`[RESEARCH_PIPELINE] Stored ${webSources.length} web sources in global cache for thread ${threadId}`);

        // Perform vector search
        console.log("[RESEARCH_PIPELINE] Starting vector search...")
        const vectorSearchResults = await searchQdrant(message, null, 5)
        console.log("[RESEARCH_PIPELINE] Vector search complete. Results:", vectorSearchResults.length)
        console.log("[RESEARCH_PIPELINE] Vector search sample result:", JSON.stringify(vectorSearchResults[0] || {}, null, 2))
        
        // Store vector search results in cache
        vectorResultsCache.set(threadId, vectorSearchResults)
        console.log("[RESEARCH_PIPELINE] Vector search results cached for thread:", threadId)

        console.log('[RESEARCH_PIPELINE] Preparing source details for prompt...')
        const webSourcesDetails = webSources.map(source => {
          // Extract date information from source content
          const dateInfo = source.content.match(/\b(20\d\d)[-\/](\d\d)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-\s](to|through|thru|[-])[-\s]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-\s](20\d\d)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-\s](20\d\d)\b|\bQ[1-4][-\s](20\d\d)\b|\b(20\d\d)\b/i);
          console.log(`[RESEARCH_PIPELINE] Processing source details for: "${source.title}"`);
          console.log(`[RESEARCH_PIPELINE] Date pattern match: ${dateInfo ? dateInfo[0] : 'None'}`);
          
          const dateHighlight = dateInfo ? `PUBLICATION DATE: ${dateInfo[0]} | ` : '';
          const recencyNote = source.recencyScore > 80 ? 'RECENT SOURCE | ' : '';
          
          console.log(`[RESEARCH_PIPELINE] Date highlight: ${dateHighlight}`);
          console.log(`[RESEARCH_PIPELINE] Recency note: ${recencyNote}`);
          
          return `[${source.index}] ${source.title}\nURL: ${source.url}\n${recencyNote}${dateHighlight}Content: ${source.content}${source.content.length > 8000 ? '...' : ''}`
        }).join('\n\n')
        
        console.log('[RESEARCH_PIPELINE] FORMATTED WEB SOURCES DETAILS (First 500 chars):');
        // console.log(webSourcesDetails.substring(0, 500) + '...');

        const imageSourcesDetails = imageSources.length > 0
          ? imageSources.map(img =>
              `[${img.index}] ${img.description}\nURL: ${img.url}\nSource: ${img.sourceUrl}`
            ).join('\n\n')
          : "No relevant images found in search results."

        const vectorSourcesDetails = vectorSearchResults.map((source, index) =>
          `[V${index + 1}] Source: ${source.source}\nChunk Index: ${source.chunkIndex}\nContent: ${source.text.substring(0, 8000)}${source.text.length > 8000 ? '...' : ''}`
        ).join('\n\n')
        
        console.log("[RESEARCH_PIPELINE] Vector sources count:", vectorSearchResults.length)
        console.log("[RESEARCH_PIPELINE] Vector sources details first item:", vectorSourcesDetails.substring(0, 200) + "...")

        const researchSystemMessage = `You are Leaf, a friendly AI assistant specialized in climate change and environmental topics. Your goal is to provide comprehensive, informative responses in a conversational tone. Follow these guidelines:

- **Conversational Style**: Write in a natural, engaging way as if having a conversation with the user directly. Use a warm, helpful tone.
- **Comprehensive Content**: Provide detailed information about the topic with relevant facts, statistics, examples, and context.
- **Visual Support**: CRITICAL - Embed 3-5 relevant images THROUGHOUT your response when available. Place them at strategic points where they enhance understanding of the content. Each image must have a descriptive caption that explains its relevance. DO NOT group all images together.
- **Evidence and Citations**: Back up claims with references to source material, citing them inline using [number] or [V#] notation.
- **Links and Resources**: IMPORTANT - Include hyperlinks throughout your response using markdown format [link text](URL). Insert these where they add value for the user.
- **Organization**: Structure your response with clear headings and paragraphs, but maintain a flowing, conversational feel throughout.
- **Source References**: When referencing vector sources, include the source citation [V#] and quote the relevant text that supports your point.
- **Recency Priority**: For queries about "latest" or "recent" information, always prioritize web search results with the most recent dates. Feature the newest information prominently at the beginning of your response, especially for publications, events, or current developments.

Your response should be thorough and informative but presented in an accessible, friendly manner. Prioritize including clear hyperlinks that the user can click for more information.`

        const imageCaption = imageSources.length > 0 
            ? `${imageSources[0].description} - Additional context about the image.` 
            : 'Description of what the image shows and why it\'s relevant';
            
        const imageInstructions = imageSources.length > 0 
            ? `- CRITICAL: Integrate 3-5 relevant images THROUGHOUT the response body using markdown: ![DESCRIPTIVE CAPTION](URL)
   - Place images at strategic points in your response where they enhance understanding
   - DO NOT group images at the beginning or end - distribute them throughout the content
   - Each image MUST have a descriptive caption directly below it
   - Format each caption as: *${imageCaption}*
   - For climate or APCTT topics, visualizations and diagrams are especially helpful` 
            : '- No images available';

        let combinedContext = `Provide a comprehensive, conversational response to this user query: "${message}"

Based on my web search, I found the following information:

${webSourcesDetails || "No web sources available from search results."}

${includeImages && imageSources.length > 0 ? `\nBased on my image search, I found these relevant images:\n\n${imageSourcesDetails}` : ''}

${vectorSearchResults.length > 0 ? `\nBased on your uploaded documents, I found these relevant excerpts:\n\n${vectorSearchResults.map((s, idx) => `[${idx + 1}] ${s.filePath ? `From ${s.filePath}` : 'From your document'} - Chunk ${s.chunkIndex || 'N/A'}\n${s.text}`).join('\n\n')}` : ''}

${mode === 'concise' ? 'Provide a concise answer limited to 1-2 paragraphs maximum. Do not include images in your response.' : 'Provide a detailed, comprehensive answer with multiple sections where appropriate.'}

Your response MUST include a References section at the end that includes ALL web sources and other sources used. 

Format the references EXACTLY like this:

\`\`\`
## References

<websources>
${(() => {
  // Deduplicate web sources by URL
  const urlMap = new Map();
  webSources.forEach((source, idx) => {
    if (!urlMap.has(source.url)) {
      urlMap.set(source.url, { source, idx });
    }
  });
  
  // Create array from map and sort by original index
  return Array.from(urlMap.values())
    .sort((a, b) => a.idx - b.idx)
    .map((item, newIdx) => {
      // Check if we have a dateInfo to include
      const dateInfo = item.source.dateInfo ? ` (${item.source.dateInfo})` : '';
      return `[${newIdx + 1}] ${item.source.title}${dateInfo} - ${item.source.url}`;
    })
    .join('\n');
})()}
</websources>

<imagesources>
${imageSources.map(i => `[I${i.index}] ${i.description} - ${i.url}`).join('\n')}
</imagesources>

<vectorsources>
${vectorSearchResults.length > 0 ? vectorSearchResults.map((s, idx) => 
`[V${idx + 1}] ${s.source || 'Unknown Source'} - Chunk ${s.chunkIndex || 'N/A'} - ${s.filePath || 'Unknown Path'}
Text excerpt: "${(s.text || '').substring(0, 300)}${(s.text || '').length > 300 ? '...' : ''}"`).join('\n\n') : 'No vector sources available.'}
</vectorsources>
\`\`\`

The block tags must be exactly as shown above, with no extra spacing or characters. ALWAYS include ALL these source blocks in your response, even if they're empty.`

        console.log('[RESEARCH_PIPELINE] Initializing Gemini model for final response...')
        console.log('[RESEARCH_PIPELINE] FIRST 8000 CHARS OF COMBINED CONTEXT:');
        console.log(combinedContext.substring(0, 8000) + '...');
        
        const leafExpModel = new ChatGoogleGenerativeAI({
          apiKey: runtimeConfig.geminiApiKey,
          model: "gemini-2.0-flash-exp",
          temperature: 0.7,  // Increased from 0.5 to encourage more creative formatting and better image incorporation
          maxRetries: 2,
        })

        console.log('[RESEARCH_PIPELINE] Sending request to Gemini model...')
        const finalResponse = await leafExpModel.invoke([
          ["system", researchSystemMessage],
          ["human", combinedContext]
        ])
        console.log('[RESEARCH_PIPELINE] Received response from Gemini model')
        
        aiResponse = ensureProperSourceBlocks(finalResponse.content, threadId)
        console.log('[RESEARCH_PIPELINE] Response cleaned and ready for database')
        
      }

      // Save AI response to database
      const savedMessage = await prisma.message.create({
        data: {
          content: aiResponse,
          role: 'assistant',
          threadId,
          userId: decoded.id,
          parentMsgId: userMessage.id
        }
      })

      // Return messages with web search data and processing state
      return { 
        messages: [userMessage, savedMessage],
        webSearchData: webSearchResults ? {
          sources: webSearchResults.results || [],
          images: webSearchResults.images || [],
          answer: webSearchResults.answer || null
        } : null,
        processingState,
        pdfProcessed: !!pdfContent
      }

    } catch (error) {
      console.error('[RESEARCH_PIPELINE] AI processing error:', error.message)
      console.error("[RESEARCH_PIPELINE] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
      console.error("[RESEARCH_PIPELINE] Full error stack:", error.stack)
      
      if (error.message?.includes('API key')) {
        event.res.statusCode = 500
        return { error: 'Invalid or missing API key' }
      }
      
      if (error.message?.includes('quota')) {
        event.res.statusCode = 429
        return { error: 'API quota exceeded' }
      }

      if (error.message?.includes('blocked')) {
        event.res.statusCode = 400
        return { error: 'Content was blocked by safety settings' }
      }

      event.res.statusCode = 500
      return { error: 'Failed to generate response: ' + error.message }
    }
  } catch (error) {
    console.error('[CHAT_API] Chat API error:', error.message)
    console.error("[CHAT_API] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
    console.error("[CHAT_API] Full error stack:", error.stack)
    event.res.statusCode = 500
    return { error: 'Error processing chat request' }
  }
})
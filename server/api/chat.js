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

const prisma = new PrismaClient()
const config = useRuntimeConfig()

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

// In-memory cache for vector search results by threadId
const vectorResultsCache = new Map()

// Qdrant client configuration
const QDRANT_URL = config.qdrantUrl
const QDRANT_API_KEY = config.qdrantApiKey
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
    console.error("[TAVILY] Invalid search results structure")
    return { webSources: [], imageSources: [] }
  }

  // Helper function to extract date indicators from text
  const extractDateIndicators = (text) => {
    if (!text) return null;
    
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
    
    return null;
  };
  
  // Score recency based on date indicators
  const scoreRecency = (result) => {
    // Check title, URL and content for date indicators
    const titleDate = extractDateIndicators(result.title);
    const urlDate = extractDateIndicators(result.url);
    const contentDate = extractDateIndicators(result.content);
    
    //console.log(`[TAVILY] Recency scoring for result: "${result.title.substring(0, 30)}..."`);
    //console.log(`[TAVILY] Date from title: ${titleDate ? JSON.stringify(titleDate) : 'None'}`);
    //console.log(`[TAVILY] Date from URL: ${urlDate ? JSON.stringify(urlDate) : 'None'}`);
    //console.log(`[TAVILY] Date from content: ${contentDate ? JSON.stringify(contentDate) : 'None'}`);
    
    // Use the most specific date found (prioritize content, then title, then URL)
    const dateInfo = contentDate || titleDate || urlDate;
    
    if (!dateInfo) {
      //console.log(`[TAVILY] No date information found, setting recency score to 0`);
      return 0;
    }
    
    // Calculate recency score - higher for more recent dates
    const currentYear = new Date().getFullYear();
    const yearDiff = currentYear - parseInt(dateInfo.year);
    
    // Base score on how recent the year is
    let recencyScore = 100 - (yearDiff * 30); // Deduct 30 points per year older
    
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
    console.log(`[TAVILY] Final recency score: ${recencyScore} for date: ${dateInfo.text}`);
    
    return recencyScore;
  };

  // Add recency score to results
  const scoredResults = searchResults.results.map(result => ({
    ...result,
    recencyScore: scoreRecency(result)
  }));
  
  // Sort by recency score (higher first) then by original score
  const sortedResults = scoredResults.sort((a, b) => {
    // If recency scores differ significantly, prioritize recency
    if (Math.abs(a.recencyScore - b.recencyScore) > 20) {
      //console.log(`[TAVILY] Sorting by recency: "${a.title.substring(0, 30)}..." (${a.recencyScore}) vs "${b.title.substring(0, 30)}..." (${b.recencyScore})`);
      return b.recencyScore - a.recencyScore;
    }
    // Otherwise, use original score
    //console.log(`[TAVILY] Sorting by original score: "${a.title.substring(0, 30)}..." (${a.score}) vs "${b.title.substring(0, 30)}..." (${b.score})`);
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

  const webSources = uniqueResults.map((result, index) => ({
    index: index + 1,
    title: result.title || "Untitled Source",
    url: result.url || "",
    content: [result.rawContent, result.content, result.content_snippet]
      .find(content => typeof content === 'string') || "",
    recencyScore: result.recencyScore
  }));

  const imageSources = (searchResults.images || []).map((img, index) => ({
    index: index + 1,
    url: img.url || "",
    description: img.description || `Image related to query`,
    sourceUrl: img.source_url || ""
  }));

  return { webSources, imageSources };
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
  
  // Check if source blocks are properly formatted
  const hasWebsources = cleaned.includes('<websources>') && cleaned.includes('</websources>');
  const hasImagesources = cleaned.includes('<imagesources>') && cleaned.includes('</imagesources>');
  const hasVectorsources = cleaned.includes('<vectorsources>') && cleaned.includes('</vectorsources>');
  
  // Extract all web source URLs for adding links to citations if needed
  let webSourceUrls = {};
  const websourcesMatch = cleaned.match(/<websources>([\s\S]*?)<\/websources>/m);
  if (websourcesMatch && websourcesMatch[1].trim()) {
    const webSourceLines = websourcesMatch[1].trim().split('\n');
    webSourceLines.forEach(line => {
      // Extract citation number and URL
      const citationMatch = line.match(/^\[(\d+)\]/);
      const urlMatch = line.match(/https?:\/\/[^\s]+/);
      if (citationMatch && urlMatch) {
        webSourceUrls[citationMatch[1]] = urlMatch[0];
      }
    });
  }
  
  // Ensure that there's a complete references section if none exists
  if (!hasWebsources || !hasImagesources || !hasVectorsources) {
    console.log('[SOURCE_BLOCKS] Missing one or more source blocks, rebuilding references section');
    
    // Create a proper References section if it doesn't exist
    if (!cleaned.match(/##\s*References/i)) {
      console.log('[SOURCE_BLOCKS] No References section found, adding one');
      cleaned += '\n\n## References\n\n';
    }
  
  // Extract the references section (everything after "## References" or similar)
  const referencesSectionMatch = cleaned.match(/##\s*References[^#]*$/i);
  
  if (!referencesSectionMatch) {
      console.log('[SOURCE_BLOCKS] Failed to locate References section after adding it, this is unexpected');
      // Add a new references section as a fallback
      cleaned += '\n\n## References\n\n';
  }
  
  // Split the response into content and references
    const contentPart = cleaned.includes('## References') ? 
      cleaned.substring(0, cleaned.indexOf('## References')) : cleaned;
    
    // Build completely new source blocks with proper tags
  let sourceBlocks = "\n\n";
  
    // Try to extract any existing web sources
    let webSourcesContent = '';
    if (websourcesMatch && websourcesMatch[1].trim()) {
      webSourcesContent = websourcesMatch[1].trim();
    } else {
      // Look for numbered references in markdown format outside of tags
      const refRegex = /\[\d+\]\s+.+(?:http|www\.)\S+/g;
      const foundRefs = cleaned.match(refRegex);
      if (foundRefs && foundRefs.length > 0) {
        console.log('[SOURCE_BLOCKS] Found references outside of tags:', foundRefs.length);
        webSourcesContent = foundRefs.join('\n');
      }
    }
    
    // Ensure web sources aren't empty - if they are, try to scan for URLs in the text
    if (!webSourcesContent || webSourcesContent.trim() === '') {
      console.log('[SOURCE_BLOCKS] Web sources are empty, scanning text for URLs');
      const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      const foundUrls = [];
      let match;
      let index = 1;
      
      while ((match = urlRegex.exec(cleaned)) !== null) {
        const title = match[1];
        const url = match[2];
        // Deduplicate by URL
        if (!foundUrls.some(item => item.url === url)) {
          foundUrls.push({ index, title, url });
          index++;
        }
      }
      
      if (foundUrls.length > 0) {
        console.log('[SOURCE_BLOCKS] Found URLs in text links:', foundUrls.length);
        webSourcesContent = foundUrls.map(item => `[${item.index}] ${item.title} - ${item.url}`).join('\n');
    } else {
        console.log('[SOURCE_BLOCKS] No URLs found in text links');
        // Still empty, check for literal http URLs in text
        const directUrlRegex = /(https?:\/\/[^\s\)]+)/g;
        const directUrls = [];
        let urlMatch;
        let urlIndex = 1;
        
        while ((urlMatch = directUrlRegex.exec(cleaned)) !== null) {
          const url = urlMatch[1];
          // Deduplicate
          if (!directUrls.some(item => item === url)) {
            directUrls.push(url);
            urlIndex++;
          }
        }
        
        if (directUrls.length > 0) {
          console.log('[SOURCE_BLOCKS] Found direct URLs in text:', directUrls.length);
          webSourcesContent = directUrls.map((url, idx) => `[${idx + 1}] Reference - ${url}`).join('\n');
        }
      }
    }
    
    // Add web sources block
    sourceBlocks += "<websources>\n" + (webSourcesContent || "No web sources available.") + "\n</websources>\n\n";
    
    // Try to extract any existing image sources
    let imageSourcesContent = '';
    const imagesourcesMatch = cleaned.match(/<imagesources>([\s\S]*?)<\/imagesources>/m);
    if (imagesourcesMatch && imagesourcesMatch[1].trim()) {
      imageSourcesContent = imagesourcesMatch[1].trim();
  } else {
      // Look for image links in markdown format
      const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
      const foundImgs = [];
      let imgMatch;
      let imgIndex = 1;
      
      while ((imgMatch = imgRegex.exec(cleaned)) !== null) {
        const description = imgMatch[1] || 'Image';
        const url = imgMatch[2];
        // Deduplicate by URL
        if (!foundImgs.some(item => item.url === url)) {
          foundImgs.push({ index: imgIndex, description, url });
          imgIndex++;
        }
      }
      
      if (foundImgs.length > 0) {
        console.log('[SOURCE_BLOCKS] Found images in markdown:', foundImgs.length);
        imageSourcesContent = foundImgs.map(item => `[I${item.index}] ${item.description} - ${item.url}`).join('\n');
      }
    }
    
    // Add image sources block
    sourceBlocks += "<imagesources>\n" + (imageSourcesContent || "No image sources available.") + "\n</imagesources>\n\n";
    
    // Try to extract any existing vector sources
    let vectorSourcesContent = '';
    const vectorsourcesMatch = cleaned.match(/<vectorsources>([\s\S]*?)<\/vectorsources>/m);
    if (vectorsourcesMatch && vectorsourcesMatch[1].trim()) {
      vectorSourcesContent = vectorsourcesMatch[1].trim();
  } else {
    // Try to get vector results from cache
    const vectorResults = vectorResultsCache.get(threadId) || [];
    console.log("[SOURCE_BLOCKS] Creating vector sources from cache. Results:", vectorResults.length);
    
    // Create vector sources block with text excerpts
      if (vectorResults.length > 0) {
        vectorSourcesContent = vectorResults.map((s, idx) => 
        `[V${idx + 1}] ${s.source || 'Unknown Source'} - Chunk ${s.chunkIndex || 'N/A'} - ${s.filePath || 'Unknown Path'}
Text excerpt: "${(s.text || '').substring(0, 300)}${(s.text || '').length > 300 ? '...' : ''}"`
        ).join('\n\n');
      } else {
        vectorSourcesContent = 'No vector sources available.';
      }
    }
    
    // Add vector sources block
    sourceBlocks += "<vectorsources>\n" + vectorSourcesContent + "\n</vectorsources>\n";
    
    // Create the new reference section
    if (cleaned.includes('## References')) {
      // Replace existing references section
      cleaned = cleaned.replace(/##\s*References[^#]*$/i, '## References\n' + sourceBlocks);
    } else {
      // Append references section
      cleaned += '\n\n## References\n' + sourceBlocks;
    }
    
    // Update web source URLs map since we've rebuilt the references
    webSourceUrls = {};
    const newWebsourcesMatch = cleaned.match(/<websources>([\s\S]*?)<\/websources>/m);
    if (newWebsourcesMatch && newWebsourcesMatch[1].trim()) {
      const webSourceLines = newWebsourcesMatch[1].trim().split('\n');
      webSourceLines.forEach(line => {
        // Extract citation number and URL
        const citationMatch = line.match(/^\[(\d+)\]/);
        const urlMatch = line.match(/https?:\/\/[^\s]+/);
        if (citationMatch && urlMatch) {
          webSourceUrls[citationMatch[1]] = urlMatch[0];
        }
      });
    }
  }
  
  // If all source blocks are present but there might be empty web sources
  if (websourcesMatch && (!websourcesMatch[1].trim() || websourcesMatch[1].trim() === "No web sources available.")) {
    console.log('[SOURCE_BLOCKS] Web sources block is empty, attempting to populate');
    
    // Split at the websources tags
    const beforeWebsources = cleaned.split('<websources>')[0];
    const afterWebsources = cleaned.split('</websources>')[1];
    
    // Look for URLs in markdown links
    const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    const foundUrls = [];
    let match;
    let index = 1;
    
    while ((match = urlRegex.exec(cleaned)) !== null) {
      const title = match[1];
      const url = match[2];
      // Deduplicate by URL
      if (!foundUrls.some(item => item.url === url)) {
        foundUrls.push({ index, title, url });
        index++;
      }
    }
    
    let webSourcesContent = "No web sources available.";
    if (foundUrls.length > 0) {
      console.log('[SOURCE_BLOCKS] Found URLs in text links to populate empty websources:', foundUrls.length);
      webSourcesContent = foundUrls.map(item => `[${item.index}] ${item.title} - ${item.url}`).join('\n');
      
      // Update webSourceUrls map
      foundUrls.forEach(item => {
        webSourceUrls[item.index.toString()] = item.url;
      });
    }
    
    // Reassemble with new web sources
    cleaned = beforeWebsources + '<websources>\n' + webSourcesContent + '\n</websources>' + afterWebsources;
  }
  
  // Scan for citations like [1], [2] that don't have hyperlinks, and add them if URLs are available
  if (Object.keys(webSourceUrls).length > 0) {
    console.log('[SOURCE_BLOCKS] Scanning for citations without hyperlinks to add them');
    
    // Split into sections to avoid applying changes to References section
    let contentPart = cleaned;
    let referencesPart = '';
    
    if (cleaned.includes('## References')) {
      contentPart = cleaned.substring(0, cleaned.indexOf('## References'));
      referencesPart = cleaned.substring(cleaned.indexOf('## References'));
    }
    
    // Find all citation references like [1], [2], etc.
    const citationRegex = /\[(\d+)\]/g;
    const citationsToProcess = [];
    let citationMatch;
    let content = contentPart;
    
    // Collect all citation positions
    while ((citationMatch = citationRegex.exec(content)) !== null) {
      const citationNumber = citationMatch[1];
      const citationPosition = citationMatch.index;
      const url = webSourceUrls[citationNumber];
      
      if (url) {
        // Check if this citation already has a nearby hyperlink
        const nearbyText = content.substring(Math.max(0, citationPosition - 100), citationPosition);
        const hasNearbyLink = nearbyText.includes('](http');
        
        if (!hasNearbyLink) {
          citationsToProcess.push({
            number: citationNumber,
            position: citationPosition,
            url: url
          });
        }
      }
    }
    
    // Process citations in reverse order (from end to start) to avoid position shifts
    if (citationsToProcess.length > 0) {
      console.log('[SOURCE_BLOCKS] Found', citationsToProcess.length, 'citations without hyperlinks to process');
      citationsToProcess.sort((a, b) => b.position - a.position);
      
      for (const citation of citationsToProcess) {
        // Find a suitable portion of text before the citation to convert to a link
        const textBefore = content.substring(Math.max(0, citation.position - 100), citation.position);
        
        // Look for a sentence fragment, phrase, or word to link
        let linkText = '';
        const sentences = textBefore.split(/(?<=[.!?])\s+/);
        if (sentences.length > 0) {
          // Take the last sentence/phrase or part of it
          const lastSentence = sentences[sentences.length - 1];
          const words = lastSentence.split(/\s+/);
          if (words.length >= 3) {
            // Take the last 3-5 words as link text
            linkText = words.slice(Math.max(0, words.length - 5)).join(' ');
          } else {
            linkText = lastSentence;
          }
        }
        
        // Fallback if no suitable text found
        if (!linkText || linkText.length < 3) {
          linkText = 'reference';
        }
        
        // Make sure the link text doesn't already contain a hyperlink
        if (!linkText.includes('](') && !linkText.includes('](')) {
          // Create the replacement - adding a hyperlink before the citation
          const citationStr = `[${citation.number}]`;
          const replacement = `[${linkText}](${citation.url}) ${citationStr}`;
          
          // Replace only this instance of the citation
          const beforeCitation = content.substring(0, citation.position);
          const afterCitation = content.substring(citation.position + citationStr.length);
          content = beforeCitation + replacement + afterCitation;
        }
      }
      
      // Reassemble the document
      cleaned = content + referencesPart;
      console.log('[SOURCE_BLOCKS] Added hyperlinks to citations');
    }
  }
  
  return cleaned;
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
    const decoded = jwt.verify(token, config.jwtSecret)
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
        initTavily(config.tavilyApiKey)
      }

      // Check query type and get conversation context
      const { isValid, type } = await isClimateRelated(message, config.geminiApiKey)
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
      const queryType = await routeQuery(message, config.geminiApiKey)
      console.log("[HANDLER] Query type determined:", queryType)

      // Route the query based on type, context, and query type
      if (type === "CONVERSATION" && queryType === "CASUAL_CONVERSATION") {
        processingState = 'conversation'
        
        const leafLiteModel = new ChatGoogleGenerativeAI({
          apiKey: config.geminiApiKey,
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
          config.geminiApiKey,
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
            const searchQueries = await generateSearchQueries(message, config.geminiApiKey);
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
        const { webSources, imageSources } = extractSourcesFromTavily(webSearchResults)
        // console.log('[RESEARCH_PIPELINE] EXTRACTED WEB SOURCES:', JSON.stringify(webSources, null, 2));
        // console.log('[RESEARCH_PIPELINE] EXTRACTED IMAGE SOURCES:', JSON.stringify(imageSources, null, 2));

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
- **Links and Resources**: CRITICAL - Include at least 3-5 clickable hyperlinks throughout your response using markdown format [link text](URL). Insert these where they add value for the user. EACH CITATION in your text should have a corresponding clickable link.
- **Organization**: Structure your response with clear headings and paragraphs, but maintain a flowing, conversational feel throughout.
- **Source References**: When referencing vector sources, include the source citation [V#] and quote the relevant text that supports your point.
- **Recency Priority**: For queries about "latest" or "recent" information, always prioritize web search results with the most recent dates. Feature the newest information prominently at the beginning of your response, especially for publications, events, or current developments.
- **MANDATORY REFERENCES**: You MUST include a "## References" section with properly formatted sources in the exact specified HTML-like tags. NEVER skip or empty this section.
- **INLINE LINKS WITH CITATIONS**: When citing a source with [1], [2], etc., ALWAYS make the relevant text ALSO a clickable link to the source URL. For example: "According to [research by NASA](https://nasa.gov/climate) [1], climate change is accelerating." This ensures users can click directly on text without navigating to references.

Your response should be thorough and informative but presented in an accessible, friendly manner. Prioritize including clear hyperlinks that the user can click for more information directly from the text.`

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

Create an engaging, detailed answer in a natural, friendly style. CRITICAL: Include images, clickable hyperlinks, and references throughout your response. The response should feel like a conversation with a knowledgeable friend rather than a formal paper. 

CRITICAL REQUIREMENT: You MUST embed 3-5 relevant images THROUGHOUT your response using markdown syntax: ![Description](URL). Distribute these images strategically throughout different sections of your answer where they enhance understanding of the concepts you're discussing. Images should be placed inline with your text, not grouped at the beginning or end.

PRIORITY FOR RECENT INFORMATION: For time-sensitive queries or when users ask about "latest", "recent", or "current" information, ALWAYS prioritize the most recent web search results (with the newest dates) over vector sources. Web sources are typically more up-to-date than vector database content. For questions about publications, events, or news, check the dates in the web sources and feature the most recent information prominently at the beginning of your response.

Use the following information sources:

WEB SOURCES:
${webSourcesDetails || "No web sources available from search results."}

IMAGE SOURCES:
${imageSourcesDetails}

VECTOR SOURCES:
${vectorSourcesDetails}

${pdfContent ? `PDF CONTENT:
${pdfContent.slice(0, 8000)}${pdfContent.length > 8000 ? '...' : ''}` : ''}

Follow these formatting guidelines:

1. **USE CONVERSATIONAL TONE**:
   - Write as if you're having a direct conversation with the user
   - Use first and second person ("I", "you") naturally
   - Be warm and helpful, avoiding overly academic language

2. **INCLUDE IMAGES THROUGHOUT**:
   ${imageInstructions}
   - MANDATORY: Images must appear throughout your response, not grouped together
   - Use images to break up text and illustrate key concepts
   - Ensure all image URLs are valid and properly formatted

3. **CITE SOURCES PROPERLY**:
   - Reference web sources as [1], [2], etc.
   - Reference images as [I1], [I2], etc.
   - Reference vector database content as [V1], [V2], etc.
   - Include direct quotes where helpful
   - CHECK DATES in web sources and prioritize the MOST RECENT information
   - For queries about "latest" content, make sure to feature the newest information first
   - Examine URLs and content for date indicators (e.g., "2024-10", "April-June 2024")
   - CRITICAL: When citing a source, make the relevant text a clickable link. Example: "[According to recent studies](https://example.com) [1], climate change is accelerating."

4. **ORGANIZATION**:
   - Use markdown headings (## and ###) to organize content
   - Break into logical sections with clear headings
   - Use bullet points or numbered lists where appropriate
   - Bold (**text**) important information

5. **INCLUDE HYPERLINKS**:
   - CRITICAL: Insert at least 3-5 clickable hyperlinks directly in your text using [Link text](URL) format
   - Add links whenever mentioning websites, organizations, or resources
   - Link to key sources when discussing specific information
   - Use descriptive link text rather than just URLs
   - IMPORTANT: Every citation [1], [2], etc. should have a corresponding clickable link in the text
   - When citing a source as [1], always make the relevant text a clickable hyperlink to the source URL

6. **DUAL LINKING REQUIREMENT**:
   - You MUST use BOTH numbered citations [1] AND make the relevant text a clickable hyperlink
   - Example: "[Climate research shows](https://climate.org/research) [1] that temperatures are rising."
   - Another example: "According to [NASA's latest data](https://nasa.gov/climate) [2], Arctic ice is melting."
   - This dual approach allows users to click directly on text without navigating to references

7. **END WITH REFERENCES - MANDATORY**:
   - ALWAYS conclude with a 'References' section listing all cited sources
   - Format each reference in a consistent way
   - CRITICAL: You MUST include a properly formatted references section with all source blocks
   - IMPORTANT: Make sure to properly enclose source blocks in these exact HTML-like tags:

\`\`\`
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
    .map((item, newIdx) => `[${newIdx + 1}] ${item.source.title} - ${item.source.url}`)
    .join('\n');
})() || "Include at least 3-5 web sources with URLs here. Format each source as: [1] Title - https://www.example.com"}
</websources>

<imagesources>
${imageSources.map(i => `[I${i.index}] ${i.description} - ${i.url}`).join('\n') || "Include all image sources here. Format as: [I1] Description - https://example.com/image.jpg"}
</imagesources>

<vectorsources>
${vectorSearchResults.length > 0 ? vectorSearchResults.map((s, idx) => 
`[V${idx + 1}] ${s.source || 'Unknown Source'} - Chunk ${s.chunkIndex || 'N/A'} - ${s.filePath || 'Unknown Path'}
Text excerpt: "${(s.text || '').substring(0, 300)}${(s.text || '').length > 300 ? '...' : ''}"`).join('\n\n') : 'No vector sources available.'}
</vectorsources>
\`\`\`

The block tags must be exactly as shown above, with no extra spacing or characters.

CRITICAL: NEVER respond with empty source blocks. Always include at least 3-5 properly formatted web sources with titles and URLs in the <websources> section.

REMEMBER: The goal is to make your response MAXIMALLY USABLE by including BOTH citation numbers [1] AND clickable hyperlinks on the relevant text, so users don't need to scroll back and forth to references.`

        console.log('[RESEARCH_PIPELINE] Initializing Gemini model for final response...')
        console.log('[RESEARCH_PIPELINE] FIRST 8000 CHARS OF COMBINED CONTEXT:');
        console.log(combinedContext.substring(0, 8000) + '...');
        
        const leafExpModel = new ChatGoogleGenerativeAI({
          apiKey: config.geminiApiKey,
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
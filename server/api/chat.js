import { PrismaClient } from '@prisma/client'
import { getCookie } from 'h3'
import jwt from 'jsonwebtoken'
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { tavily } from "@tavily/core"
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"

const prisma = new PrismaClient()

// Initialize Tavily client
let tavilyClient = null

// In-memory cache for active conversations
const conversationCache = new Map()

// Helper function to initialize Tavily
function initTavily(apiKey) {
  if (!tavilyClient && apiKey) {
    try {
      tavilyClient = tavily({ apiKey: apiKey })
      return true
    } catch (error) {
      console.error('Failed to initialize Tavily client:', error)
      return false
    }
  }
  return !!tavilyClient
}

// Search configuration
const SEARCH_OPTIONS = {
  searchDepth: "advanced",
  timeRange: "year",
  includeAnswer: "advanced",
  includeImages: true,
  includeImageDescriptions: true,
  includeRawContent: false,
  includeDomains: [
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
    "climatenexus.org"
  ],
};

// Function to determine if a query requires research
function requiresResearch(query) {
  const researchKeywords = [
    "climate change", "global warming", "study", "research", "experiment",
    "scientific", "evidence", "hypothesis", "theory", "methodology",
    "data", "statistics", "analysis", "correlation", "causation", "trends",
    "metrics", "quantitative", "qualitative", "sample size", "margin of error",
    "paper", "publication", "journal", "peer-reviewed", "citations",
    "bibliography", "literature review", "meta-analysis", "proceedings",
    "facts", "verify", "historical", "timeline", "survey",
    "poll", "census", "demographic", "percentage", "rate",
    "graph", "chart", "diagram", "table", "figure", "visualization",
    "map", "plot", "image", "picture", "illustration",
    "medical", "legal", "economic", "political", "technological",
    "environmental", "psychological", "sociological", "anthropological",
    "recent", "latest", "current", "news", "development", "update",
    "breakthrough", "discovery", "innovation", "advancement",
    "why does", "how does", "what causes", "explain", "compare",
    "contrast", "analyze", "evaluate", "examine", "investigate",
    "policy", "adaptation", "graphs", "charts", "tables", "report",
    "findings", "references", "images"
  ];
  
  return researchKeywords.some(keyword =>
    query.toLowerCase().includes(keyword.toLowerCase())
  );
}

// Function to check if this is just a casual conversation
function isCasualConversation(query) {
  const casualPhrases = [
    "hello", "hi", "hey", "how are you", "good morning", "good afternoon",
    "good evening", "what's up", "how's it going", "nice to meet you",
    "thanks", "thank you", "bye", "goodbye", "talk to you later", "chat"
  ];
  
  return casualPhrases.some(phrase => 
    query.toLowerCase().includes(phrase.toLowerCase())
  );
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
    // Create a temporary file to store the PDF
    const tempFilePath = join(tmpdir(), `temp_pdf_${Date.now()}.pdf`)
    writeFileSync(tempFilePath, pdfBuffer)
    
    // Use PDFLoader to extract text
    const loader = new PDFLoader(tempFilePath, {
      splitPages: false
    })
    const docs = await loader.load()
    
    // Clean up temporary file
    try {
      unlinkSync(tempFilePath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary PDF file:', cleanupError)
    }
    
    // Return the extracted text
    return docs.length > 0 ? docs[0].pageContent : ""
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    return ""
  }
}

// Helper function to generate numbered references from search results
function generateNumberedReferences(searchResults) {
  if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
    return { referenceMap: {}, referencesSection: "" };
  }
  
  const referenceMap = {};
  let referencesSection = "## References\n\n";
  
  searchResults.results.forEach((result, index) => {
    const refNumber = index + 1;
    const refKey = `[${refNumber}]`;
    
    // Map URL to reference number
    referenceMap[result.url] = refKey;
    
    // Create references section
    referencesSection += `${refKey} ${result.title}. ${result.url}\n\n`;
  });
  
  return { referenceMap, referencesSection };
}

// Helper function to extract key topics from conversation with Gemini
async function extractKeyTopics(messages, geminiApiKey) {
  // Combine last few messages
  const recentMessages = messages.slice(-5).map(m => m.content).join("\n")
  if (!recentMessages.trim()) {
    return []
  }
  
  try {
    const geminiModel = new ChatGoogleGenerativeAI({
      apiKey: geminiApiKey,
      model: "gemini-2.0-flash",
      temperature: 0.1,
    })

    const response = await geminiModel.invoke([
      ["system", "Extract 3-5 key topics or entities mentioned in the following conversation snippet. Return them as a comma-separated list without descriptions or explanations."],
      ["human", recentMessages],
    ])
    
    return response.content.split(',').map(topic => topic.trim())
  } catch (error) {
    console.error('Failed to extract topics:', error)
    return []
  }
}

// Helper function to find relevant previous messages using semantic similarity
async function findRelevantPreviousMessages(messages, currentQuery, geminiApiKey) {
  try {
    if (messages.length < 5) return [] // Not enough history to be useful
    
    const geminiModel = new ChatGoogleGenerativeAI({
      apiKey: geminiApiKey,
      model: "gemini-2.0-flash",
      temperature: 0.1,
    })
    
    const truncatedMessages = messages.slice(-15).map(m => `${m.role}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`)
    
    const prompt = `Below is a conversation history and a new query.
    
CONVERSATION HISTORY:
${truncatedMessages.join('\n\n')}

NEW QUERY: ${currentQuery}

Find the 2-3 most relevant previous messages from the conversation history that would help answer the new query.
Return only the message numbers in the conversation (1 for the first message, 2 for the second, etc.), comma-separated.
If no messages are relevant, return "NONE".`
    
    const response = await geminiModel.invoke([
      ["system", "You are a helpful assistant that identifies the most relevant messages in a conversation history."],
      ["human", prompt],
    ])
    
    const result = response.content.trim()
    if (result === "NONE") return []
    
    // Parse message numbers and get the actual messages
    const messageIndices = result.split(',').map(num => parseInt(num.trim()) - 1).filter(idx => !isNaN(idx) && idx >= 0 && idx < messages.length)
    return messageIndices.map(idx => messages[idx])
  } catch (error) {
    console.error('Failed to find relevant previous messages:', error)
    return []
  }
}

// Helper function to generate conversation summary
async function generateConversationSummary(messages, geminiApiKey) {
  // Combine the last few messages into a string
  const recentMessages = messages.slice(-10)
    .map(m => `${m.role}: ${m.content.slice(0, 300)}${m.content.length > 300 ? '...' : ''}`)
    .join("\n\n");
    
  if (!recentMessages.trim()) {
    return "";
  }
  
  try {
    const summarizationModel = new ChatGoogleGenerativeAI({
      apiKey: geminiApiKey,
      model: "gemini-2.0-flash",
      temperature: 0.2,
    })
    
    const response = await summarizationModel.invoke([
      ["system", "Summarize the main points and ongoing themes of this conversation in 3-5 sentences. Focus on key information that would be important for continuing the conversation naturally."],
      ["human", `Summarize this conversation:\n\n${recentMessages}`],
    ])
    
    return response.content
  } catch (error) {
    console.error('Failed to generate summary:', error)
    return null
  }
}

// Function to generate a context-aware system message
async function generateContextAwareSystemMessage(thread, messages, currentQuery, geminiApiKey) {
  // Base system message
  let systemMessage = `You are Leaf, a helpful AI expert assistant specialized in climate change mitigation and research, developed by APCTT. Your responses are thoughtful, engaging, detailed, and informative. You are in a conversation thread titled "${thread.title}". You cannot answer questions outside of the climate science domain.`;
  
  // Check if we have the thread in cache
  if (conversationCache.has(thread.id)) {
    const cachedData = conversationCache.get(thread.id)
    
    systemMessage += `\n\nThis is a continuing conversation. Here's what we've discussed so far:`
    
    if (cachedData.summary) {
      systemMessage += `\n\nCONVERSATION SUMMARY: ${cachedData.summary}`
    }
    
    if (cachedData.keyTopics && cachedData.keyTopics.length > 0) {
      systemMessage += `\n\nKEY TOPICS: ${cachedData.keyTopics.join(', ')}`
    }
    
    // Find relevant previous messages
    const relevantMessages = await findRelevantPreviousMessages(messages, currentQuery, geminiApiKey)
    if (relevantMessages.length > 0) {
      systemMessage += `\n\nRELEVANT PREVIOUS MESSAGES:`
      relevantMessages.forEach((msg, idx) => {
        systemMessage += `\n\n${msg.role.toUpperCase()}: ${msg.content.slice(0, 300)}${msg.content.length > 300 ? '...' : ''}`
      })
    }
  } else {
    // Initialize cache for this thread
    const summary = await generateConversationSummary(messages, geminiApiKey)
    const keyTopics = await extractKeyTopics(messages, geminiApiKey)
    
    conversationCache.set(thread.id, {
      summary,
      keyTopics,
      userPreferences: null,
      lastUpdated: new Date(),
    })
    
    if (summary) {
      systemMessage += `\n\nCONVERSATION SUMMARY: ${summary}`
    }
    
    if (keyTopics && keyTopics.length > 0) {
      systemMessage += `\n\nKEY TOPICS: ${keyTopics.join(', ')}`
    }
  }
  
  return systemMessage
}

// Function to update conversation cache
async function updateConversationCache(threadId, messages, geminiApiKey) {
  // Only update if cache exists and it's been at least 5 minutes since last update
  if (conversationCache.has(threadId)) {
    const cachedData = conversationCache.get(threadId)
    const now = new Date()
    const timeDiff = now - cachedData.lastUpdated
    
    // Update every 5 minutes
    if (timeDiff > 5 * 60 * 1000) {
      const summary = await generateConversationSummary(messages, geminiApiKey)
      const keyTopics = await extractKeyTopics(messages, geminiApiKey)
      
      conversationCache.set(threadId, {
        ...cachedData,
        summary: summary || cachedData.summary,
        keyTopics: keyTopics || cachedData.keyTopics,
        lastUpdated: now,
      })
    }
  }
}

// Helper function to keep the most important parts of the conversation history
function getOptimalConversationHistory(messages, currentQuery) {
  if (messages.length <= 10) {
    // If we have 10 or fewer messages, use all of them
    return messages.map(msg => [`${msg.role === 'user' ? 'human' : 'assistant'}`, msg.content])
  }
  
  // Always include the first message for context
  const firstMessage = messages[0]
  
  // Include the last 6 messages for recency
  const recentMessages = messages.slice(-6)
  
  // Find messages with similar keywords to the current query
  const queryWords = currentQuery.toLowerCase().split(/\W+/).filter(word => word.length > 3)
  const relevantMessages = messages.filter((msg, idx) => {
    // Skip first and recent messages to avoid duplicates
    if (idx === 0 || recentMessages.includes(msg)) return false
    
    const msgWords = msg.content.toLowerCase().split(/\W+/).filter(word => word.length > 3)
    return queryWords.some(word => msgWords.includes(word))
  }).slice(0, 3) // Take up to 3 relevant messages
  
  // Combine and sort chronologically
  const selectedMessages = [firstMessage, ...relevantMessages, ...recentMessages]
    .filter((msg, idx, arr) => arr.findIndex(m => m === msg) === idx) // Remove duplicates
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  
  return selectedMessages.map(msg => [`${msg.role === 'user' ? 'human' : 'assistant'}`, msg.content])
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

  const config = useRuntimeConfig()
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    const body = await readBody(event)
    const { 
      threadId, 
      message, 
      pdfContext,
      enableWebSearch = true
    } = body

    if (!threadId || !message) {
      event.res.statusCode = 400
      return { error: 'ThreadId and message are required' }
    }

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
          
          // Extract text from PDF
          pdfContent = await extractTextFromPDF(buffer)
          console.log('Successfully extracted PDF content:', pdfContent.slice(0, 200) + '...')
        } catch (error) {
          console.error('Error processing PDF:', error)
        }
      }

      // Initialize models for different scenarios
      const leafBaseModel = new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: "gemini-2.0-flash",
        temperature: 0.2,
        maxRetries: 2,
      })

      const leafThinkingModel = new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: "gemini-2.0-flash-thinking-exp-01-21",
        temperature: 0,
        maxRetries: 2,
      })

      // Initialize Tavily if needed
      if (enableWebSearch && requiresResearch(message)) {
        initTavily(config.tavilyApiKey)
      }

      // Get context-aware system message using Gemini
      const systemMessage = await generateContextAwareSystemMessage(thread, thread.messages, message, config.geminiApiKey)

      // Get the most relevant conversation history
      const conversationHistory = getOptimalConversationHistory(thread.messages, message)

      // Prepare PDF prompt
      let pdfPrompt = ""
      if (pdfContent) {
        pdfPrompt = `\n\nI have uploaded a PDF document with the following content. Please analyze this content along with my query:\n\n${pdfContent}\n\nBased on the above PDF content and my question: "${message}", please provide an informed response.`
      }

      if (isCasualConversation(message)) {
        // Just use the base model for casual conversation
        processingState = 'casual-conversation'
        
        const response = await leafBaseModel.invoke([
          ["system", systemMessage],
          ...conversationHistory,
          ["human", pdfContent ? `${message}\n\nI've also uploaded a PDF that contains the following information: ${pdfContent.slice(0, 2000)}${pdfContent.length > 2000 ? '...' : ''}` : message],
        ])
        
        aiResponse = response.content
        
      } else if (requiresResearch(message) && enableWebSearch) {
        // For research questions, use the full pipeline
        processingState = 'research-pipeline'
        
        // Step 1: Retrieve Search Results with Tavily
        if (tavilyClient) {
          try {
            webSearchResults = await tavilyClient.search(message, SEARCH_OPTIONS)
            
            // Generate numbered references from search results
            const referencesData = generateNumberedReferences(webSearchResults);
            referenceMap = referencesData.referenceMap;
            referencesSection = referencesData.referencesSection;
          } catch (searchError) {
            console.warn('Web search failed:', searchError)
          }
        }

        // Step 2: Get an Initial Answer from Leaf base model
        const initialResponse = await leafBaseModel.invoke([
          ["system", systemMessage],
          ...conversationHistory,
          ["human", pdfContent ? `${message}\n\nI've also uploaded a PDF that contains the following information: ${pdfContent.slice(0, 2000)}${pdfContent.length > 2000 ? '...' : ''}` : message],
        ])

        // Find relevant previous exchanges that might be related to this query
        const relevantPreviousMessages = await findRelevantPreviousMessages(
          thread.messages, 
          message,
          config.geminiApiKey
        )
        
        // Format the relevant exchanges for the context
        const relevantExchanges = relevantPreviousMessages.length > 0 
          ? `\n\nRelevant information from our previous conversation:\n` + 
            relevantPreviousMessages.map(msg => 
              `${msg.role.toUpperCase()}: ${msg.content.slice(0, 300)}${msg.content.length > 300 ? '...' : ''}`
            ).join('\n\n')
          : ''

        // Step 3: Combine Information for the Thinking model
        let combinedContext = `Initial answer from Leaf:
${initialResponse.content}

${webSearchResults ? `Latest detailed search results from Tavily:
${JSON.stringify(webSearchResults, null, 2)}

Reference Numbers for each source:
${JSON.stringify(referenceMap, null, 2)}` : 'No search results available.'}

${pdfContent ? `PDF Document Content:
${pdfContent.slice(0, 3000)}${pdfContent.length > 3000 ? '...' : ''}` : 'No PDF content available.'}${relevantExchanges}

Using the above information, please provide a final, detailed answer as Leaf.
Your answer must include:
- A clear summary and detailed analysis of the topic.
- **Directly embed relevant images within the text where appropriate. Use markdown image syntax: ![alt text](image URL)**.
- For each image, include a short caption describing the image and its relevance to the text.
- **VERY IMPORTANT: When stating facts or citing information, include the appropriate reference number [1], [2], etc. after the statement.**
- **DO NOT create your own reference numbers. ONLY use the reference numbers provided in the "Reference Numbers for each source" section above.**
- End your response with the complete "References" section that lists all numbered sources.
- Your response should feel like a continuation of an ongoing conversation, referencing previous topics when relevant.
Ensure the answer is structured and clear, similar to a well-designed blog post or textbook explanation.`;

        // Step 4: Synthesize the Final Answer Using Leaf Thinking
        const finalResponse = await leafThinkingModel.invoke([
          ["system", systemMessage],
          ["human", combinedContext]
        ])
        
        // Use the AI response, but make sure it ends with the references section
        aiResponse = finalResponse.content;
        
        // If the AI didn't include the references section or didn't format it correctly,
        // append the properly formatted references section
        if (!aiResponse.includes("## References") && referencesSection) {
          aiResponse += "\n\n" + referencesSection;
        }
        
      } else {
        // For general questions (not casual, not research)
        processingState = 'general-question'
        
        const response = await leafBaseModel.invoke([
          ["system", systemMessage],
          ...conversationHistory,
          ["human", pdfContent ? `${message}\n\nI've also uploaded a PDF that contains the following information: ${pdfContent.slice(0, 2000)}${pdfContent.length > 2000 ? '...' : ''}` : message],
        ])
        
        aiResponse = response.content
      }

      // Save AI response to database
      const savedMessage = await prisma.message.create({
        data: {
          content: aiResponse,
          role: 'assistant',
          threadId,
          userId: decoded.id
        }
      })
      
      // Update conversation cache with latest context
      await updateConversationCache(threadId, [...thread.messages, userMessage, savedMessage], config.geminiApiKey)

      // Return messages with web search data and processing state
      return { 
        messages: [userMessage, savedMessage],
        webSearchData: webSearchResults ? {
          sources: webSearchResults.results || [],
          images: webSearchResults.images || [],
          answer: webSearchResults.answer || null,
          referenceMap: referenceMap // Include the reference mapping
        } : null,
        processingState,
        pdfProcessed: !!pdfContent // Add flag to indicate if PDF was processed
      }

    } catch (error) {
      console.error('AI processing error:', error)
      
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
    console.error('Chat API error:', error)
    event.res.statusCode = 500
    return { error: 'Error processing chat request' }
  }
})

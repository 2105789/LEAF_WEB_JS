import { PrismaClient } from '@prisma/client'
import { getCookie } from 'h3'
import jwt from 'jsonwebtoken'
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { tavily } from "@tavily/core"
import { QdrantClient } from "@qdrant/js-client-rest"
import { pipeline } from '@xenova/transformers'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"

const prisma = new PrismaClient()

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

// Qdrant client configuration
const qdrantClient = new QdrantClient({
  url: "https://1f924b4d-5cfa-4e17-9709-e7683b563598.europe-west3-0.gcp.cloud.qdrant.io:6333",
  apiKey: "Nygu4XKFKDhPxO47WOuaY_g2YsX3XTFacn39AvxaeOwtZ2Qnjbh46A"
})

// Collection name
const COLLECTION_NAME = "leaf_data_v2"

// Initialize embedding pipeline (make it globally accessible)
let embeddingPipeline

async function initializeEmbeddingPipeline() {
  try {
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/paraphrase-mpnet-base-v2')
  } catch (error) {
    console.error("Error initializing embedding pipeline:", error)
    throw error
  }
}

async function getEmbedding(text) {
  try {
    if (!embeddingPipeline) {
      await initializeEmbeddingPipeline()
    }
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    })
    return Array.from(output.data)
  } catch (error) {
    console.error("Error generating embedding:", error)
    throw error
  }
}

// Search Qdrant for relevant chunks
async function searchQdrant(query, sourceFilter = null, limit = 5) {
  try {
    const queryVector = await getEmbedding(query)
    const filter = sourceFilter ? { must: [{ key: "source", match: { value: sourceFilter } }] } : undefined

    const searchResult = await qdrantClient.search(COLLECTION_NAME, {
      vector: queryVector,
      filter: filter,
      limit: limit,
      with_payload: true,
    })

    return searchResult.map(result => ({
      id: result.id,
      source: result.payload.source,
      filePath: result.payload.file_path || `data\\${result.payload.source}.pdf`,
      chunkIndex: result.payload.chunk_index,
      text: result.payload.text || result.payload.content,
      score: result.score,
    }))
  } catch (error) {
    console.error("Error searching Qdrant:", error)
    return []
  }
}

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
1. CLIMATE: Directly related to climate change, environmental sustainability, or related domains
2. CONVERSATION: Basic conversation, context questions, or task-related queries (like summarizing PDFs, asking about previous discussions)
3. OTHER: Completely unrelated topics

Query: "${query}"

Return ONLY "CLIMATE", "CONVERSATION", or "OTHER".`

  try {
    const topicResponse = await topicModel.invoke([["human", topicPrompt]])
    const result = topicResponse.content.trim().toUpperCase()
    return { 
      isValid: result === "CLIMATE" || result === "CONVERSATION",
      type: result
    }
  } catch (error) {
    console.error("Error checking query type:", error)
    return { isValid: true, type: "CONVERSATION" }
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
async function determineSearchParameters(query, geminiApiKey) {
  const paramModel = new ChatGoogleGenerativeAI({
    apiKey: geminiApiKey,
    model: "gemini-2.0-flash-lite",
    temperature: 0,
    maxRetries: 2,
  })

  const paramPrompt = `
Analyze this climate-related query: "${query}"

Based on this query, determine these search parameters:
1. searchDepth: "basic" for simple queries, "advanced" for complex research questions
2. timeRange: "day", "week", "month", "year" based on information recency needs
3. includeImages: boolean depending on if visual representation would be helpful
4. maxResults: integer between 3 and 15 based on query complexity (more complex = more results)

Return ONLY a valid JSON object without any markdown formatting, code blocks, or explanations:
{"searchDepth":"advanced","timeRange":"year","includeImages":true,"maxResults":10}`

  try {
    const paramResponse = await paramModel.invoke([["human", paramPrompt]])
    let responseContent = paramResponse.content.trim().replace(/```json\s*/g, "").replace(/```\s*$/g, "")
    return JSON.parse(responseContent)
  } catch (error) {
    console.error("Error determining search parameters:", error)
    return { searchDepth: "advanced", timeRange: "year", includeImages: true, maxResults: 10 }
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
1. CASUAL_CONVERSATION: Simple greetings, chitchat, or personal exchanges unrelated to climate
2. RESEARCH_QUESTION: Questions that require factual information, data, studies, or citations, latest recent data, sources, images, urls.
3. GENERAL_QUESTION: Other non-research climate questions that don't require citations

Query: "${query}"

Return ONLY the category name, nothing else. No explanations.`

  try {
    const routerResponse = await routerModel.invoke([["human", routerPrompt]])
    const classification = routerResponse.content.trim().toUpperCase()
    if (classification.includes("CASUAL")) return "CASUAL_CONVERSATION"
    if (classification.includes("RESEARCH")) return "RESEARCH_QUESTION"
    return "GENERAL_QUESTION"
  } catch (error) {
    console.error("Error in query routing:", error)
    return "GENERAL_QUESTION"
  }
}

// Function to extract and format sources from search results
function extractSourcesFromTavily(searchResults) {
  if (!searchResults || !searchResults.results || !Array.isArray(searchResults.results)) {
    console.error("Invalid search results structure")
    return { webSources: [], imageSources: [] }
  }

  const webSources = searchResults.results.map((result, index) => ({
    index: index + 1,
    title: result.title || "Untitled Source",
    url: result.url || "",
    content: [result.rawContent, result.content, result.content_snippet]
      .find(content => typeof content === 'string') || ""
  }))

  const imageSources = (searchResults.images || []).map((img, index) => ({
    index: index + 1,
    url: img.url || "",
    description: img.description || `Image related to query`,
    sourceUrl: img.source_url || ""
  }))

  return { webSources, imageSources }
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
      console.warn('Failed to clean up temporary PDF file:', cleanupError)
    }
    
    return docs.length > 0 ? docs[0].pageContent : ""
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    return ""
  }
}

// Helper function to clean markdown response
function cleanMarkdownResponse(response) {
  // Remove ```markdown at the start and ``` at the end if present
  return response.replace(/^```markdown\n/, '').replace(/\n```$/, '').trim()
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
          pdfContent = await extractTextFromPDF(buffer)
          console.log('Successfully extracted PDF content:', pdfContent.slice(0, 200) + '...')
        } catch (error) {
          console.error('Error processing PDF:', error)
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

      // Route the query based on type and context
      if (type === "CONVERSATION") {
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
        
        let searchParams = await determineSearchParameters(message, config.geminiApiKey)
        
        const searchOptions = {
          searchDepth: searchParams.searchDepth || "advanced",
          timeRange: searchParams.timeRange || "year",
          includeAnswer: "advanced",
          includeImages: searchParams.includeImages !== false,
          includeImageDescriptions: true,
          includeRawContent: true,
          maxResults: Math.min(Math.max(searchParams.maxResults || 10, 3), 20),
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
        }

        // Perform web search
        if (enableWebSearch && tavilyClient) {
          try {
            webSearchResults = await tavilyClient.search(message, searchOptions)
            console.log("Tavily Search Response received")
          } catch (searchError) {
            console.error("Error in Tavily search:", searchError)
            webSearchResults = { results: [], images: [] }
          }
        }

        const { webSources, imageSources } = extractSourcesFromTavily(webSearchResults)

        // Perform vector search
        console.log("Performing vector search...")
        const vectorSearchResults = await searchQdrant(message, null, 5)
        console.log("Vector search complete.")

        const webSourcesDetails = webSources.map(source =>
          `[${source.index}] ${source.title}\nURL: ${source.url}\nContent: ${source.content.substring(0, 1000)}${source.content.length > 1000 ? '...' : ''}`
        ).join('\n\n')

        const imageSourcesDetails = imageSources.length > 0
          ? imageSources.map(img =>
              `[${img.index}] ${img.description}\nURL: ${img.url}\nSource: ${img.sourceUrl}`
            ).join('\n\n')
          : "No relevant images found in search results."

        const vectorSourcesDetails = vectorSearchResults.map((source, index) =>
          `[V${index + 1}] Source: ${source.source}\nChunk Index: ${source.chunkIndex}\nContent: ${source.text.substring(0, 1000)}${source.text.length > 1000 ? '...' : ''}`
        ).join('\n\n')

        const researchSystemMessage = `You are Leaf, a specialized AI expert assistant focused on climate change mitigation and research. Your task is to produce a comprehensive, research-paper-style response that is a minimum of 2000 words, resembling an academic paper with extensive depth, rigor, and detail. Follow these guidelines:

- **Length and Depth**: The response must be at least 2000 words, structured as a full research paper with 15-20 paragraphs, covering all relevant aspects of the query exhaustively.
- **Scientific Rigor**: Use precise, evidence-based language, integrating data, studies, and real-world examples. Explain technical terms parenthetically and use analogies for complex concepts.
- **Narrative Style**: Write in an engaging, authoritative tone with contractions, rhetorical questions, and emphasis markers (*italic*, **bold**) to maintain reader interest.
- **Evidence Integration**: Seamlessly weave sources into the text, citing them in-line with [number] for web/image sources and [V#] for vector sources.

Structure your response as follows:
- **Abstract**: A 150-200 word summary of key findings and conclusions.
- **Introduction**: Contextualize the query with a hook ('This matters because...') and outline the paper's scope.
- **Background**: Provide historical and scientific context (e.g., Current Situation, Science Behind It).
- **Main Analysis**: Multiple detailed sections (e.g., Impacts, Solutions, Challenges, Case Studies) with subheadings.
- **Discussion**: Analyze implications, trade-offs, and future directions.
- **Conclusion**: Summarize key takeaways and actionable insights.
- **References**: A dedicated section listing all cited sources with full details, consolidating web, image, and vector sources.`

        let combinedContext = `Provide a comprehensive, research-paper-style answer to this user query: "${message}"

The response must be a minimum of 2000 words, structured as an academic paper with 15-20 paragraphs, including an abstract, introduction, background, detailed analysis sections, discussion, conclusion, and references. Use the following information sources to craft your answer:

WEB SOURCES:
${webSourcesDetails || "No web sources available from search results."}

IMAGE SOURCES:
${imageSourcesDetails}

VECTOR SOURCES:
${vectorSourcesDetails}

${pdfContent ? `PDF CONTENT:
${pdfContent.slice(0, 8000)}${pdfContent.length > 8000 ? '...' : ''}` : ''}

Follow these formatting requirements exactly:

1. **FORMAT USING PROFESSIONAL MARKDOWN**:
   - Use headings (#, ##) for sections and subsections
   - Use lists (- or 1.) and tables for data where applicable
   - Use bold (**bold**) and italic (*italic*) for emphasis

2. **START DIRECTLY WITH THE ABSTRACT**:
   - Begin with a 150-200 word abstract summarizing findings
   - Do NOT include greetings like "I'm Leaf" or introductory phrases
   - Launch straight into the content

3. **INCLUDE IMAGES**:
   ${imageSources.length > 0 ? `- Select 3-5 relevant images
   - Insert using markdown: ![DESCRIPTIVE CAPTION](URL)
   - Each image MUST have a detailed caption in italics below it, incorporating information from the image description
   - Format each caption as: *${imageSources.length > 0 ? imageSources[0].description + ' - Relevance to the topic explained.' : 'Description of the image and its relevance'}*` : '- No images available'}

4. **CITE SOURCES PROPERLY**:
   - Use [1], [2], etc. for web sources, [I1], [I2], etc. for image sources, and [V1], [V2], etc. for vector sources
   - Cite 5-7 unique sources in the text, including direct quotes
   - Include a 'References' section listing all cited sources with full details

5. **STRUCTURE REQUIREMENTS**:
   - Abstract (150-200 words)
   - Introduction (with 'This matters because...' hook)
   - Background (historical/scientific context)
   - 3-5 detailed analysis sections (e.g., Impacts, Solutions, Challenges)
   - Discussion (implications and future directions)
   - Conclusion (key takeaways)
   - References (consolidated list of all cited sources)

6. **END WITH SEGREGATED SOURCE SECTIONS**:
   - Include a 'References' section with all cited sources (web, image, vector) listed together
   - Follow with separate blocks:
     <websources>
     ${webSources.map(s => `[${s.index}] ${s.title} - ${s.url}`).join('\n')}
     </websources>
     <imagesources>
     ${imageSources.map(i => `[I${i.index}] ${i.description} - ${i.url}`).join('\n')}
     </imagesources>
     <vectorsources>
     ${vectorSearchResults.map(s => `[V${vectorSearchResults.indexOf(s) + 1}] ${s.source} - Chunk ${s.chunkIndex} - ${s.filePath}`).join('\n')}
     </vectorsources>`

        const leafExpModel = new ChatGoogleGenerativeAI({
          apiKey: config.geminiApiKey,
          model: "gemini-2.0-flash-exp",
          temperature: 0.4,
          maxRetries: 2,
        })

        const finalResponse = await leafExpModel.invoke([
          ["system", researchSystemMessage],
          ["human", combinedContext]
        ])
        
        aiResponse = cleanMarkdownResponse(finalResponse.content)
        
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
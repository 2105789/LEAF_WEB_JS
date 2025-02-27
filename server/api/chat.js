import { PrismaClient } from '@prisma/client';
import { getCookie } from 'h3';
import jwt from 'jsonwebtoken';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tavily } from "@tavily/core";
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";


const prisma = new PrismaClient();

// Initialize Tavily client
let tavilyClient = null;

// In-memory cache for active conversations
const conversationCache = new Map();

// Helper function to initialize Tavily
function initTavily(apiKey) {
    if (!tavilyClient && apiKey) {
        try {
            tavilyClient = tavily({ apiKey: apiKey });
            return true;
        } catch (error) {
            console.error('Failed to initialize Tavily client:', error);
            return false;
        }
    }
    return !!tavilyClient;
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
        "findings", "references", "images", "list", "urls", "sources", "links", "link"
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
    return buffer.slice(0, 5).toString() === '%PDF-';
}

// Helper function to convert base64 to buffer
function base64ToBuffer(base64) {
    return Buffer.from(base64, 'base64');
}

// Helper function to extract text from PDF
async function extractTextFromPDF(pdfBuffer) {
    try {
        // Create a temporary file to store the PDF
        const tempFilePath = join(tmpdir(), `temp_pdf_${Date.now()}.pdf`);
        writeFileSync(tempFilePath, pdfBuffer);

        // Use PDFLoader to extract text
        const loader = new PDFLoader(tempFilePath, {
            splitPages: false
        });
        const docs = await loader.load();

        // Clean up temporary file
        try {
            unlinkSync(tempFilePath);
        } catch (cleanupError) {
            console.warn('Failed to clean up temporary PDF file:', cleanupError);
        }

        // Return the extracted text
        return docs.length > 0 ? docs[0].pageContent : "";
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        return "";
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

// Helper function to extract key topics
async function extractKeyTopics(messages, geminiApiKey) {
    // Combine last few messages, handling different message types
    const recentMessages = messages.slice(-5).map(m => {
      if (typeof m.content === 'string') {
        return `${m.role}: ${m.content}`;
      } else if (Array.isArray(m.content) && m.content.length > 0 && typeof m.content[0] === 'object' && 'text' in m.content[0]) {
        return `${m.role}: ${m.content[0].text}`;
      }
      return '';  // Fallback for unexpected content types
    }).join("\n");

    if (!recentMessages.trim()) {
      return [];
    }

    try {
      const geminiModel = new ChatGoogleGenerativeAI({
        apiKey: geminiApiKey,
        model: "gemini-2.0-flash", // Consider using a consistent model
        temperature: 0.1,
      });

      const response = await geminiModel.invoke([
        new SystemMessage("Extract 3-5 key topics or entities mentioned in the following conversation snippet. Return them as a comma-separated list without descriptions or explanations."),
        new HumanMessage(recentMessages),
      ]);

      // Handle different response content types
      let topicsText = '';
      if (typeof response.content === 'string') {
          topicsText = response.content;
      } else if (Array.isArray(response.content) && response.content.length > 0 && typeof response.content[0] === 'object' && 'text' in response.content[0]) {
          topicsText = response.content[0].text;
      }

      return topicsText.split(',').map(topic => topic.trim()).filter(topic => topic !== ""); // Filter out empty strings

    } catch (error) {
      console.error('Failed to extract topics:', error);
      return [];
    }
  }


  // Helper function to find relevant previous messages using semantic similarity
  async function findRelevantPreviousMessages(messages, currentQuery, geminiApiKey) {
    try {
      if (messages.length < 3) return []; // Not enough history to be useful. Reduced to 3 for more frequent updates.

      const geminiModel = new ChatGoogleGenerativeAI({
        apiKey: geminiApiKey,
        model: "gemini-2.0-flash",  //Consistent model
        temperature: 0.1,
      });
      // Truncate and prepare messages for analysis
      const truncatedMessages = messages.slice(-10).map(m => {  // Reduced to -10
        const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) && m.content.length > 0 && 'text' in m.content[0]) ? m.content[0].text : '';
        return `${m.role}: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`;
      });

      const prompt = `Below is a conversation history and a new query.

CONVERSATION HISTORY:
${truncatedMessages.join('\n\n')}

NEW QUERY: ${currentQuery}

Identify the 1-2 MOST relevant previous messages (or NONE if none are truly relevant) from the conversation history that directly relate to answering the new query.  Return ONLY the message numbers (1 for the first message, 2 for the second, etc.), comma-separated.  Prioritize messages that provide direct context or information needed for the new query. If no messages are relevant, return "NONE".`;


      const response = await geminiModel.invoke([
        new SystemMessage("You are a helpful assistant that identifies the most relevant messages in a conversation history."),
        new HumanMessage(prompt),
      ]);

      const result = typeof response.content === 'string' ? response.content.trim() : (Array.isArray(response.content) && response.content.length > 0 && 'text' in response.content[0] ? response.content[0].text.trim() : "NONE");

      if (result === "NONE") return [];

      // Parse message numbers and get the actual messages
        const messageIndices = result.split(',').map(num => parseInt(num.trim()) - 1).filter(idx => !isNaN(idx) && idx >= 0 && idx < messages.length);
        return messageIndices.map(idx => messages[idx]);


    } catch (error) {
      console.error('Failed to find relevant previous messages:', error);
      return [];
    }
  }


  // Helper function to generate conversation summary
  async function generateConversationSummary(messages, geminiApiKey) {
     // Combine the last few messages, handling different content types
    const recentMessages = messages.slice(-7) // Reduced to -7
      .map(m => {
        const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) && m.content.length > 0 && 'text' in m.content[0]) ? m.content[0].text : '';
        return `${m.role}: ${content.slice(0, 300)}${content.length > 300 ? '...' : ''}`;
      })
      .join("\n\n");

    if (!recentMessages.trim()) {
      return "";
    }

    try {
      const summarizationModel = new ChatGoogleGenerativeAI({
        apiKey: geminiApiKey,
        model: "gemini-2.0-flash", // Consistent model
        temperature: 0.2,
      });

      const response = await summarizationModel.invoke([
        new SystemMessage("Summarize the main points and ongoing themes of this conversation in 2-4 sentences. Focus on key information that would be important for continuing the conversation naturally and concisely."),
        new HumanMessage(`Summarize this conversation:\n\n${recentMessages}`),
      ]);
      // Handle different content structures in response
        return typeof response.content === 'string' ? response.content : (Array.isArray(response.content) && response.content.length > 0 && 'text' in response.content[0] ? response.content[0].text : '');

    } catch (error) {
      console.error('Failed to generate summary:', error);
      return null;
    }
  }

  // Function to generate a context-aware system message
  async function generateContextAwareSystemMessage(thread, messages, currentQuery, geminiApiKey) {
    // Base system message
    let systemMessage = `You are Leaf, a helpful AI expert assistant specialized in climate change mitigation and research, developed by APCTT. Your responses are thoughtful, engaging, detailed, and informative.  You are in a conversation thread titled "${thread.title}".  Your primary focus is climate science; avoid answering questions unrelated to this domain.  Speak in a friendly and approachable tone, like a knowledgeable tutor.`;

    // Check if we have the thread in cache
    if (conversationCache.has(thread.id)) {
      const cachedData = conversationCache.get(thread.id);

        systemMessage += `\n\nWe are continuing our conversation.  Here's a quick recap:`

      if (cachedData.summary) {
        systemMessage += `\n\nSUMMARY OF OUR CONVERSATION: ${cachedData.summary}`;
      }

      if (cachedData.keyTopics && cachedData.keyTopics.length > 0) {
        systemMessage += `\n\nKEY TOPICS WE'VE DISCUSSED: ${cachedData.keyTopics.join(', ')}`;
      }

      // Find relevant previous messages
        const relevantMessages = await findRelevantPreviousMessages(messages, currentQuery, geminiApiKey);
        if (relevantMessages.length > 0) {
            systemMessage += `\n\nMOST RELEVANT PREVIOUS MESSAGES:\n`;
            relevantMessages.forEach(msg => {
                const content = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) && msg.content.length > 0 && 'text' in msg.content[0] ? msg.content[0].text : '');
                systemMessage += `\n${msg.role.toUpperCase()}: ${content.slice(0, 300)}${content.length > 300 ? '...' : ''}`;
            });
        }
    } else {
      // Initialize cache for this thread
      const summary = await generateConversationSummary(messages, geminiApiKey);
      const keyTopics = await extractKeyTopics(messages, geminiApiKey);

      conversationCache.set(thread.id, {
        summary,
        keyTopics,
        userPreferences: null, // Placeholder for future user preferences
        lastUpdated: new Date(),
      });

      if (summary) {
        systemMessage += `\n\nCONVERSATION SUMMARY: ${summary}`;
      }

      if (keyTopics && keyTopics.length > 0) {
        systemMessage += `\n\nKEY TOPICS: ${keyTopics.join(', ')}`;
      }
    }

    // Add a prompt to acknowledge the current query
    systemMessage += `\n\nNow, you've asked: "${currentQuery}".  Let's address that.`;

    return systemMessage;
  }

  // Function to update conversation cache
  async function updateConversationCache(threadId, messages, geminiApiKey) {
   // Only update if cache exists and it's been at least *2* minutes since last update
    if (conversationCache.has(threadId)) {
      const cachedData = conversationCache.get(threadId);
      const now = new Date();
      const timeDiff = now - cachedData.lastUpdated;

      // Update every 2 minutes (or if key data is missing)
        if (timeDiff > 2 * 60 * 1000 || !cachedData.summary || !cachedData.keyTopics) {
            const summary = await generateConversationSummary(messages, geminiApiKey);
            const keyTopics = await extractKeyTopics(messages, geminiApiKey);

            conversationCache.set(threadId, {
                ...cachedData,
                summary: summary !== null ? summary : cachedData.summary,  //Keep old if new is null
                keyTopics: keyTopics.length > 0 ? keyTopics : cachedData.keyTopics, // Keep old if new is empty
                lastUpdated: now,
            });
        }
    }
  }

// Helper function to create the conversation history for the model
function getOptimalConversationHistory(messages, currentQuery) {
    const recentMessages = messages.slice(-3); // Always include the last 3 messages
    const formattedRecentMessages = recentMessages.map(msg => {
        if (msg.role === 'user') {
            return new HumanMessage(msg.content);
        } else { // Assuming 'assistant' role
            // Handle different AIMessage content types
            if (typeof msg.content === 'string') {
                return new AIMessage(msg.content);
            } else if (Array.isArray(msg.content) && msg.content.length > 0 && typeof msg.content[0] === 'object' && 'text' in msg.content[0]) {
                return new AIMessage(msg.content[0].text);
            }
            return new AIMessage(""); // Fallback for unexpected content types
        }
    });
    return formattedRecentMessages;
}



export default defineEventHandler(async (event) => {
    if (event.req.method !== 'POST') {
        event.res.statusCode = 405;
        return { error: 'Method not allowed' };
    }

    // Verify authentication
    const token = getCookie(event, 'auth_token');
    if (!token) {
        event.res.statusCode = 401;
        return { error: 'Unauthorized' };
    }

    const config = useRuntimeConfig();
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        const body = await readBody(event);
        const {
            threadId,
            message,
            pdfContext,
            enableWebSearch = true  // Default to enabling web search
        } = body;

        if (!threadId || !message) {
            event.res.statusCode = 400;
            return { error: 'ThreadId and message are required' };
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
        });

        if (!thread) {
            event.res.statusCode = 404;
            return { error: 'Thread not found' };
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
            });

            let aiResponse = '';
            let processingState = 'initializing';
            let webSearchResults = null;
            let referenceMap = {};
            let referencesSection = "";

            // Process PDF if provided
            let pdfContent = "";
            if (pdfContext) {
                try {
                    const buffer = base64ToBuffer(pdfContext);
                    if (!isPDFValid(buffer)) {
                        throw new Error('Invalid PDF format');
                    }

                    // Extract text from PDF
                    pdfContent = await extractTextFromPDF(buffer);
                    console.log('Successfully extracted PDF content:', pdfContent.slice(0, 200) + '...');
                } catch (error) {
                    console.error('Error processing PDF:', error);
                    //  Don't halt execution; proceed without PDF context.
                }
            }

   // Initialize models
const leafBaseModel = new ChatGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
    model: "gemini-2.0-flash",
    temperature: 0.3, // Slightly increased temperature for more varied responses
    maxRetries: 3,    // Increased retries
});

const leafThinkingModel = new ChatGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
    model: "gemini-2.0-flash", // Using the same model for consistency
    temperature: 0.1,        // Lower temperature for focused synthesis
    maxRetries: 3,          // Increased retries
});


            // Initialize Tavily if needed
            if (enableWebSearch && requiresResearch(message)) {
                initTavily(config.tavilyApiKey);
            }

               // Get context-aware system message
            const systemMessage = await generateContextAwareSystemMessage(thread, [...thread.messages, userMessage], message, config.geminiApiKey);
            // Get the most relevant conversation history
            const conversationHistory = getOptimalConversationHistory([...thread.messages, userMessage], message);



            if (isCasualConversation(message)) {
                // Just use the base model for casual conversation
                processingState = 'casual-conversation';
                  const messages = [
                      new SystemMessage(systemMessage),
                        ...conversationHistory,
                        new HumanMessage(message)
                    ];

                const response = await leafBaseModel.invoke(messages);
                // Handle different response types
                aiResponse = typeof response.content === 'string' ? response.content : (Array.isArray(response.content) && response.content.length>0 && 'text' in response.content[0]) ? response.content[0].text : "How can I help you further with climate science?";

            } else if (requiresResearch(message) && enableWebSearch) {
              // For research questions, use the full pipeline
                processingState = 'research-pipeline';

                // Step 1: Retrieve Search Results with Tavily
                if (tavilyClient) {
                    try {
                        webSearchResults = await tavilyClient.search(message, SEARCH_OPTIONS);

                        // Generate numbered references from search results
                        const referencesData = generateNumberedReferences(webSearchResults);
                        referenceMap = referencesData.referenceMap;
                        referencesSection = referencesData.referencesSection;
                    } catch (searchError) {
                        console.warn('Web search failed:', searchError);
                        // Proceed without web search results
                    }
                }
             // Step 2: Get an Initial Answer from Leaf base model, including PDF context if available
                let initialPrompt = message;
                if (pdfContent) {
                    initialPrompt += `\n\nI've also uploaded a PDF that contains the following information: ${pdfContent.slice(0, 2000)}${pdfContent.length > 2000 ? '...' : ''}`;
                }
                const initialMessages = [
                    new SystemMessage(systemMessage),
                    ...conversationHistory,
                    new HumanMessage(initialPrompt)
                ];
                const initialResponse = await leafBaseModel.invoke(initialMessages);
                let initialAnswer = typeof initialResponse.content === 'string'? initialResponse.content : (Array.isArray(initialResponse.content) && initialResponse.content.length>0 && 'text' in initialResponse.content[0] ? initialResponse.content[0].text : "I'm analyzing your request...");

                // Step 3: Combine Information for the Thinking model
                let combinedContext = `Initial answer from Leaf:
${initialAnswer}

${webSearchResults ? `Latest detailed search results from Tavily:
${JSON.stringify(webSearchResults, null, 2)}

Reference Numbers for each source:
${JSON.stringify(referenceMap, null, 2)}` : 'No search results available.'}

${pdfContent ? `PDF Document Content:
${pdfContent.slice(0, 3000)}${pdfContent.length > 3000 ? '...' : ''}` : 'No PDF content available.'}

Using the above information, please provide a final, detailed answer as Leaf.
Your answer should:
- Start by directly addressing the user's query.
- Provide a clear and concise summary, followed by a more detailed analysis if needed.
- **Directly embed relevant images within the text where appropriate. Use markdown image syntax: ![alt text](image URL)**. Include a short caption.
- **Cite sources using the provided reference numbers [1], [2], etc., immediately after the relevant facts.**
- **ONLY use the provided reference numbers. DO NOT create your own.**
- Conclude with a brief, friendly closing remark.
- Include the complete "References" section at the very end.

Maintain a conversational and engaging tone, as if continuing an ongoing discussion.`;



                // Step 4: Synthesize the Final Answer Using Leaf Thinking
                 const finalMessages = [
                    new SystemMessage(systemMessage), // Re-iterate the system message
                    new HumanMessage(combinedContext)
                ];
                const finalResponse = await leafThinkingModel.invoke(finalMessages);
                 // Handle different response types
                aiResponse = typeof finalResponse.content === 'string' ? finalResponse.content : (Array.isArray(finalResponse.content) && finalResponse.content.length > 0 && 'text' in finalResponse.content[0]) ? finalResponse.content[0].text : "I've compiled the information for you.";


                // Append the references section if it's missing
                if (!aiResponse.includes("## References") && referencesSection) {
                    aiResponse += "\n\n" + referencesSection;
                }


            } else {
                // For general questions (not casual, not research)
                processingState = 'general-question';

                let generalPrompt = message;
                if (pdfContent) {
                    generalPrompt += `\n\nI've also uploaded a PDF that contains the following information: ${pdfContent.slice(0, 2000)}${pdfContent.length > 2000 ? '...' : ''}`;
                }
                   const messages = [
                        new SystemMessage(systemMessage),
                        ...conversationHistory,
                        new HumanMessage(generalPrompt)
                    ];

                const response = await leafBaseModel.invoke(messages);
                aiResponse = typeof response.content === 'string' ? response.content : (Array.isArray(response.content) && response.content.length >0 && 'text' in response.content[0] ? response.content[0].text : "Here's what I found...");
            }

            // Save AI response to database
            const savedMessage = await prisma.message.create({
                data: {
                    content: aiResponse,
                    role: 'assistant',
                    threadId,
                    userId: decoded.id
                }
            });

            // Update conversation cache with latest context
            await updateConversationCache(threadId, [...thread.messages, userMessage, savedMessage], config.geminiApiKey);

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
            };

        } catch (error) {
            console.error('AI processing error:', error);

            if (error.message?.includes('API key')) {
                event.res.statusCode = 500;
                return { error: 'Invalid or missing API key' };
            }

            if (error.message?.includes('quota')) {
                event.res.statusCode = 429;
                return { error: 'API quota exceeded' };
            }

            if (error.message?.includes('blocked')) {
                event.res.statusCode = 400;
                return { error: 'Content was blocked by safety settings' };
            }
            //Generic error
            event.res.statusCode = 500;
            return { error: 'Failed to generate response: ' + error.message };
        }
    } catch (error) {
        console.error('Chat API error:', error);
        event.res.statusCode = 500;
        return { error: 'Error processing chat request' };
    }
});
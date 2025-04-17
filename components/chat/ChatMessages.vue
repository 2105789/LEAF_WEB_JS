<!-- Chat Messages Component -->
<template>
  <div class="flex-1 overflow-y-auto bg-gray-50 overscroll-contain" ref="messagesContainer" @click="handleContainerClick">
    <!-- Empty state with suggestions -->
    <div v-if="selectedThread && messages.length === 0" class="h-full flex items-center justify-center p-2 md:p-4">
      <div class="max-w-4xl w-full mx-auto p-2 md:p-4 space-y-4 md:space-y-6 -mt-8 md:-mt-20">
        <h3 class="text-center text-md md:text-lg text-gray-600 mb-4 md:mb-6">Here are some suggestions to get started:</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <div 
            v-for="(suggestion, index) in suggestions" 
            :key="index"
            @click="handleSuggestionClick(suggestion)"
            class="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-gray-100 hover:border-teal-200 hover:shadow transition-all cursor-pointer transform hover:-translate-y-1"
          >
            <div class="text-xl md:text-2xl mb-2">{{ suggestion.emoji }}</div>
            <h4 class="font-medium text-gray-900 mb-1 md:mb-2">{{ suggestion.title }}</h4>
            <p class="text-xs md:text-sm text-gray-600">{{ suggestion.question }}</p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Messages with optimized rendering -->
    <div v-else-if="selectedThread" class="p-2 md:p-4 space-y-3 md:space-y-4">
      <div 
        v-for="message in optimizedMessages" 
        :key="message.id"
        class="max-w-3xl mx-auto"
      >
        <div 
          :class="[
            'rounded-lg shadow-sm relative group transition-all py-2 md:py-3',
            message.role === 'user' 
              ? 'bg-teal-50 border border-teal-100' 
              : 'bg-white border border-gray-100'
          ]"
        >
          <div class="flex items-start gap-2 md:gap-3 p-2 md:p-3">
            <!-- Avatar -->
            <div 
              class="w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-sm shrink-0"
              :class="message.role === 'user' ? 'bg-teal-100 text-teal-600' : 'bg-emerald-50 text-emerald-600'"
            >
              {{ message.role === 'user' ? 'U' : 'L' }}
            </div>
            
            <!-- Message Content -->
            <div class="flex-1 min-w-0">
              <div 
                class="prose prose-sm max-w-none"
                :class="message.role === 'user' ? 'text-teal-900' : 'text-gray-700'"
                v-html="getProcessedContent(message)"
              ></div>
              
              <!-- Sources Collapsible Section -->
              <div v-if="message.role === 'assistant' && hasAnySources(message.content)" class="mt-2 md:mt-3 space-y-2">
                <!-- Web Sources -->
                <div v-if="hasSources(message.content, 'web')" class="border rounded-lg overflow-hidden">
                  <button 
                    @click="toggleSourceType(message.id, 'web')"
                    class="w-full px-3 py-2 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span class="font-medium text-xs md:text-sm">Web Sources ({{ countSources(message.content, 'web') }})</span>
                    <svg 
                      class="w-4 h-4 transform transition-transform"
                      :class="isSourceTypeExpanded(message.id, 'web') ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="isSourceTypeExpanded(message.id, 'web')" class="px-3 py-2 border-t text-xs md:text-sm">
                    <ul class="space-y-1 text-xs md:text-sm pl-2">
                      <li v-for="(source, i) in getSourcesIfExpanded(message.content, 'web')" :key="i" class="py-1">
                        <div v-if="source === 'No web sources available.'" class="text-gray-500 italic">
                          {{ source }}
                        </div>
                        <div v-else class="flex items-start">
                          <span class="reference-number mr-2 shrink-0">{{ source.match(/^\[\d+\]/) ? source.match(/^\[\d+\]/)[0] : '' }}</span>
                          <span class="flex-1">
                            <a v-if="isValidUrl(source)" :href="extractUrl(source)" target="_blank" rel="noopener noreferrer" 
                               class="text-blue-600 hover:text-blue-800 hover:underline inline-block">
                              {{ formatSource(source).title || formatSource(source).url }}
                            </a>
                            <span v-else>{{ source.replace(/^\[\d+\]/, '').trim() }}</span>
                          </span>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Image Sources -->
                <div v-if="hasSources(message.content, 'image')" class="border rounded-lg overflow-hidden">
                  <button 
                    @click="toggleSourceType(message.id, 'image')"
                    class="w-full px-3 py-2 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span class="font-medium text-xs md:text-sm">Image Sources ({{ countSources(message.content, 'image') }})</span>
                    <svg 
                      class="w-4 h-4 transform transition-transform"
                      :class="isSourceTypeExpanded(message.id, 'image') ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="isSourceTypeExpanded(message.id, 'image')" class="px-3 py-2 border-t text-xs md:text-sm">
                    <ul class="space-y-1 text-xs md:text-sm pl-2">
                      <li v-for="(source, i) in getSourcesIfExpanded(message.content, 'image')" :key="i" class="py-1">
                        <span class="image-reference-number">{{ source.match(/^\[I\d+\]/) ? source.match(/^\[I\d+\]/)[0] : '' }}</span>
                        <a v-if="isValidUrl(source)" :href="extractUrl(source)" target="_blank" rel="noopener noreferrer" 
                           class="text-blue-600 hover:text-blue-800 hover:underline inline-block">
                          {{ formatSource(source).title || formatSource(source).url }}
                        </a>
                        <span v-else>{{ source.replace(/^\[I\d+\]/, '').trim() }}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Vector Sources -->
                <div v-if="hasSources(message.content, 'vector')" class="border rounded-lg overflow-hidden">
                  <button 
                    @click="toggleSourceType(message.id, 'vector')"
                    class="w-full px-3 py-2 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span class="font-medium text-xs md:text-sm">Document Sources ({{ countSources(message.content, 'vector') }})</span>
                    <svg 
                      class="w-4 h-4 transform transition-transform"
                      :class="isSourceTypeExpanded(message.id, 'vector') ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="isSourceTypeExpanded(message.id, 'vector')" class="px-3 py-2 border-t text-xs md:text-sm">
                    <ul class="space-y-3 text-xs md:text-sm pl-2">
                      <li v-for="(source, i) in getSourcesIfExpanded(message.content, 'vector')" :key="i" class="py-1 text-gray-700 whitespace-pre-line">
                        <div v-if="source === 'No vector sources available.'">{{ source }}</div>
                        <div v-else>
                          <div>
                            <span class="vector-reference-number">{{ source.match(/^\[V\d+\]/) ? source.match(/^\[V\d+\]/)[0] : '' }}</span>
                            <span class="font-medium">{{ source.replace(/^\[V\d+\]/, '').split('\nText excerpt:')[0].trim() }}</span>
                          </div>
                          <div class="mt-1 pl-4 text-gray-600 text-xs border-l-2 border-gray-200">
                            {{ source.includes('Text excerpt:') ? 
                               source.split('Text excerpt:')[1].trim().replace(/^"|"$/g, '') : '' }}
                          </div>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <span class="text-xs mt-2 block" :class="message.role === 'user' ? 'text-teal-400' : 'text-gray-400'">
                {{ formatDate(message.createdAt) }}
              </span>
            </div>
            
            <!-- Copy Button -->
            <button 
              v-if="message.role === 'assistant'"
              @click="copyToClipboard(message.content)"
              class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 p-1"
              title="Copy response"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            </button>
          </div>
          <!-- Copy Code Button (only shown when message has code) -->
          <div 
            v-if="message.role === 'assistant' && hasCodeBlock(message.content)"
            class="border-t border-gray-50 bg-gray-50 py-1 px-3 rounded-b-lg flex justify-end"
          >
            <button 
              @click="copyToClipboard(extractCode(message.content))"
              class="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
              </svg>
              Copy code
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Processing State (Simplified) -->
    <div v-if="isLoading" class="max-w-3xl mx-auto p-2 md:p-4">
      <div class="bg-white rounded-lg shadow-sm p-3 md:p-4 border border-gray-100">
        <div class="flex items-start gap-2 md:gap-3">
          <div class="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 text-sm shrink-0">
            {{ processingState === 'research' ? '🔍' : '⚡' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <div class="flex space-x-1">
                <div class="h-2 w-2 bg-teal-300 rounded-full animate-pulse"></div>
                <div class="h-2 w-2 bg-teal-300 rounded-full animate-pulse delay-75"></div>
                <div class="h-2 w-2 bg-teal-300 rounded-full animate-pulse delay-150"></div>
              </div>
              <span class="text-xs md:text-sm text-gray-500 ml-2">
                {{ processingState === 'research' ? 'Researching' : 'Generating' }}... {{ processingTime }}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- No Thread Selected State -->
    <div v-if="!selectedThread" class="h-full flex items-center justify-center p-2 md:p-4">
      <div class="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-gray-100 max-w-xs md:max-w-md w-full text-center">
        <div class="text-3xl md:text-4xl mb-3 md:mb-4">💬</div>
        <h3 class="text-lg md:text-xl font-medium text-gray-900 mb-2">Select a Thread</h3>
        <p class="text-xs md:text-sm text-gray-500">Choose an existing thread from the sidebar or create a new one to start chatting.</p>
      </div>
    </div>
  </div>
  
  <!-- Image Modal -->
  <div v-if="showImageModal" 
       class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
       @click="closeImageModal">
    <div class="relative max-w-4xl max-h-[90vh]" @click.stop>
      <img :src="modalImageUrl" alt="Zoomed Image" class="block max-w-full max-h-[inherit] rounded-lg object-contain">
      <button 
        @click="closeImageModal"
        class="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1.5 hover:bg-gray-600"
        aria-label="Close image view"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, nextTick } from 'vue'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import markdownItSup from 'markdown-it-sup'

// Initialize markdown parser once
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true
}).use(markdownItSup)

const props = defineProps({
  messages: {
    type: Array,
    required: true
  },
  selectedThread: {
    type: Object,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  processingTime: {
    type: Number,
    default: 0
  },
  processingState: {
    type: String,
    default: 'general'
  },
  includeImages: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['copy-success', 'copy-error', 'submit'])
const messagesContainer = ref(null)
const expandedSourceTypes = ref(new Map())
const contentCache = new Map()
const dateFormatCache = new Map()
const showImageModal = ref(false)
const modalImageUrl = ref('')

// Use a computed property for messages to optimize rendering
const optimizedMessages = computed(() => {
  return props.messages
})

// Better date formatting with caching
const formatDate = (date) => {
  if (dateFormatCache.has(date)) {
    return dateFormatCache.get(date)
  }
  
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  
  let formatted
  
  // If less than 24 hours, show relative time
  if (diff < 24 * 60 * 60 * 1000) {
    if (diff < 60 * 1000) {
      formatted = 'Just now'
    } else if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000))
      formatted = `${minutes} min ago`
    } else {
      const hours = Math.floor(diff / (60 * 60 * 1000))
      formatted = `${hours} hr ago`
    }
  } else {
    formatted = d.toLocaleString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  dateFormatCache.set(date, formatted)
  return formatted
}

// Check if message contains code block
const hasCodeBlock = (content) => {
  return content.includes('```')
}

// Extract code from message
const extractCode = (content) => {
  const matches = content.match(/```(?:\w+)?\n([\s\S]*?)```/g)
  if (!matches) return ''
  return matches
    .map(block => block.replace(/```(?:\w+)?\n([\s\S]*?)```/, '$1').trim())
    .join('\n\n')
}

// Check for any sources
const hasAnySources = (content) => {
  return hasSources(content, 'web') || 
         hasSources(content, 'image') || 
         hasSources(content, 'vector')
}

// Count total sources
const countAllSources = (content) => {
  let count = 0
  if (hasSources(content, 'web')) {
    count += getSourcesIfExpanded(content, 'web').length
  }
  if (hasSources(content, 'image')) {
    count += getSourcesIfExpanded(content, 'image').length
  }
  if (hasSources(content, 'vector')) {
    count += getSourcesIfExpanded(content, 'vector').length
  }
  return count
}

// Check if content has sources
const hasSources = (content, type) => {
  const regex = {
    web: /<websources>([^]*?)<\/websources>/s,
    image: /<imagesources>([^]*?)<\/imagesources>/s,
    vector: /<vectorsources>([^]*?)<\/vectorsources>/s
  }
  return regex[type].test(content)
}

// Get sources if expanded
const getSourcesIfExpanded = (content, type) => {
  const regex = {
    web: /<websources>([^]*?)<\/websources>/s,
    image: /<imagesources>([^]*?)<\/imagesources>/s,
    vector: /<vectorsources>([^]*?)<\/vectorsources>/s
  }
  const match = content.match(regex[type])
  if (!match) return []
  
  // Special handling for vector sources to show both reference and text excerpts
  if (type === 'vector') {
    const vectorContent = match[1].trim();
    if (vectorContent === 'No vector sources available.') {
      return ['No vector sources available.'];
    }
    
    // Split by lines but preserve multi-line text excerpts
    const entries = [];
    const lines = vectorContent.split('\n');
    let currentEntry = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('[V')) {
        // Start a new entry
        if (currentEntry) {
          entries.push(currentEntry);
        }
        currentEntry = line;
      } else if (line.startsWith('Text excerpt:') && currentEntry) {
        // This is a text excerpt for the current entry
        currentEntry += '\n' + line;
      } else if (line && currentEntry) {
        // This is part of the current entry (likely part of the text excerpt)
        currentEntry += '\n' + line;
      }
    }
    
    // Add the last entry
    if (currentEntry) {
      entries.push(currentEntry);
    }
    
    return entries;
  }
  
  // Handle web sources and ensure proper numbering
  if (type === 'web') {
    // Ensure we get clean content without the tags
    const webContent = match[1].trim();
    
    // Handle empty or "No web sources available"
    if (!webContent || webContent === "No web sources available.") {
      return ["No web sources available."];
    }
    
    // Split by lines and clean up
    const rawSources = webContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Check if we need to renumber or if the sources are malformed
    let needsFixing = false;
    
    // Look for visible tag issue or any other formatting problem
    if (webContent.includes("<websources>") || webContent.includes("</websources>")) {
      needsFixing = true;
    }
    
    // Check for numbering issues
    const sourcesWithNumbers = rawSources.map((source, index) => {
      const numMatch = source.match(/^\[(\d+)\]/);
      if (!numMatch || parseInt(numMatch[1]) !== index + 1) {
        needsFixing = true;
      }
      return { source, index };
    });
    
    if (needsFixing) {
      // Rebuild the sources with proper numbering
      return rawSources.map((source, index) => {
        // Strip any existing numbering
        const cleanSource = source.replace(/^\[\d+\]\s*/, '');
        // Add proper numbering
        return `[${index + 1}] ${cleanSource}`;
      });
    }
    
    return rawSources;
  }
  
  // Handle image sources and ensure proper numbering
  if (type === 'image') {
    const rawSources = match[1].trim().split('\n').filter(line => line.trim());
    
    // Check if sources need renumbering
    const needsRenumbering = rawSources.some((source, index) => {
      const numbering = source.match(/^\[I(\d+)\]/);
      return !numbering || parseInt(numbering[1]) !== index + 1;
    });
    
    if (needsRenumbering) {
      return rawSources.map((source, index) => {
        const oldNumberMatch = source.match(/^\[I(\d+)\]/);
        if (oldNumberMatch) {
          // Replace old number with new number
          return source.replace(/^\[I\d+\]/, `[I${index + 1}]`);
        }
        return `[I${index + 1}] ${source}`;
      });
    }
    
    return rawSources;
  }
  
  return match[1].trim().split('\n').filter(line => line.trim());
}

// Count sources by type
const countSources = (content, type) => {
  if (type === 'vector') {
    const regex = /<vectorsources>([^]*?)<\/vectorsources>/s;
    const match = content.match(regex);
    if (!match) return 0;
    
    const vectorContent = match[1].trim();
    if (vectorContent === 'No vector sources available.') {
      return 0;
    }
    
    // Count entries that start with [V
    // With text excerpts, entries are now separated by blank lines
    const entries = vectorContent.split('\n\n');
    return entries.filter(entry => entry.trim().startsWith('[V')).length;
  }
  
  return getSourcesIfExpanded(content, type).length;
}

// Toggle source type expansion for a message
const toggleSourceType = (messageId, sourceType) => {
  const key = `${messageId}-${sourceType}`
  
  if (!expandedSourceTypes.value.has(key)) {
    expandedSourceTypes.value.set(key, true)
  } else {
    expandedSourceTypes.value.delete(key)
  }
}

// Check if source type is expanded
const isSourceTypeExpanded = (messageId, sourceType) => {
  const key = `${messageId}-${sourceType}`
  return expandedSourceTypes.value.has(key)
}

// Check if string is a valid URL
const isValidUrl = (string) => {
  try {
    return Boolean(string.match(/(https?:\/\/[^\s]+)/))
  } catch (e) {
    return false
  }
}

// Extract URL from source string
const extractUrl = (source) => {
  const match = source.match(/(https?:\/\/[^\s]+)/)
  return match ? match[1] : ''
}

// Format source for display
const formatSource = (source) => {
  // Remove any leading [X] or [IX] or [VX] index
  const withoutIndex = source.replace(/^\[[^\]]+\]\s*/, '')
  // Get the text before the URL
  const url = extractUrl(source)
  let title = withoutIndex
  if (url) {
    title = withoutIndex.split(url)[0].trim()
    // Remove trailing dash or hyphen if present
    title = title.replace(/\s*[-–]\s*$/, '')
  }
  return { title, url }
}

// Process content with optimized markdown rendering
const getProcessedContent = (message) => {
  // Include both props.includeImages and current mode in the cache key
  const isConciseMode = props.processingState === 'concise' || localStorage.getItem('leafweb_responseMode') === 'concise'
  const effectiveImageSetting = isConciseMode ? false : props.includeImages
  const cacheKey = message.id + '-' + message.content + '-' + effectiveImageSetting
  
  if (contentCache.has(cacheKey)) {
    return contentCache.get(cacheKey)
  }
  
  // Extract web source URLs for reference linking
  const webSourceUrls = {};
  const websourcesMatch = message.content.match(/<websources>([\s\S]*?)<\/websources>/s);
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
  
  // Remove source sections from display
  const cleanContent = message.content
    .replace(/<websources>[^]*?<\/websources>/s, '')
    .replace(/<imagesources>[^]*?<\/imagesources>/s, '')
    .replace(/<vectorsources>[^]*?<\/vectorsources>/s, '')
    
  // Render markdown
  let rendered = DOMPurify.sanitize(md.render(cleanContent))
  
  // Add clickable links to citation references
  if (Object.keys(webSourceUrls).length > 0) {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = rendered
    
    // Regular expression to find citation references [1], [2], etc.
    const citationRegex = /\[(\d+)\]/g
    
    // Process all text nodes to find and replace citations
    const processTextNode = (node) => {
      const text = node.textContent
      const citationMatches = Array.from(text.matchAll(citationRegex))
      
      if (citationMatches.length > 0) {
        // Create a document fragment to hold the new content
        const fragment = document.createDocumentFragment()
        let lastIndex = 0
        
        for (const match of citationMatches) {
          const citationNumber = match[1]
          const url = webSourceUrls[citationNumber]
          
          if (url) {
            // Add text before the citation
            if (match.index > lastIndex) {
              fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)))
            }
            
            // Create a link for the citation
            const link = document.createElement('a')
            link.href = url
            link.className = 'citation-link text-blue-600 hover:underline'
            link.setAttribute('target', '_blank')
            link.setAttribute('rel', 'noopener noreferrer')
            link.textContent = `[${citationNumber}]`
            link.title = `View reference ${citationNumber}`
            
            fragment.appendChild(link)
            lastIndex = match.index + match[0].length
          }
        }
        
        // Add any remaining text
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)))
        }
        
        // Replace the original text node with the fragment
        if (fragment.childNodes.length > 0) {
          node.parentNode.replaceChild(fragment, node)
          return true
        }
      }
      
      return false
    }
    
    // Recursively process all text nodes in the document
    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return processTextNode(node)
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip processing within pre, code, or a tags
        if (node.nodeName === 'PRE' || node.nodeName === 'CODE' || node.nodeName === 'A') {
          return false
        }
        
        // Process all child nodes
        const childNodes = Array.from(node.childNodes)
        let modified = false
        
        for (const child of childNodes) {
          modified = processNode(child) || modified
        }
        
        return modified
      }
      
      return false
    }
    
    processNode(tempDiv)
    rendered = tempDiv.innerHTML
  }
  
  // Hide images if includeImages is false or in concise mode
  if (!effectiveImageSetting) {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = rendered
    
    // Find all images and replace them with placeholders
    const images = tempDiv.querySelectorAll('img')
    images.forEach(img => {
      const imgPlaceholder = document.createElement('div')
      imgPlaceholder.className = 'bg-gray-100 text-gray-500 text-xs text-center p-2 rounded border border-gray-200 my-2'
      imgPlaceholder.innerText = isConciseMode ? 
        '🖼️ Images disabled in concise mode' : 
        '🖼️ Image hidden (toggle images to view)'
      img.parentNode.replaceChild(imgPlaceholder, img)
    })
    
    rendered = tempDiv.innerHTML
  }
  
  // Cache the result
  contentCache.set(cacheKey, rendered)
  
  return rendered
}

// Copy to clipboard
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    emit('copy-success')
  } catch (err) {
    console.error('Failed to copy text:', err)
    emit('copy-error')
  }
}

// Optimized scroll to bottom
const scrollToBottom = () => {
  if (!messagesContainer.value) return
  
  // Use a debounced/throttled scroll
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(() => {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    })
  } else {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Handle suggestion clicks
const handleSuggestionClick = (suggestion) => {
  emit('submit', {
    message: suggestion.question,
    pdfContext: null,
    mode: 'general'
  })
}

// Open image modal
const openImageModal = (url) => {
  modalImageUrl.value = url
  showImageModal.value = true
}

// Close image modal
const closeImageModal = () => {
  showImageModal.value = false
  modalImageUrl.value = ''
}

// Handle clicks within the messages container for image popups
const handleContainerClick = (event) => {
  // Check if the clicked element is an image within a message content div
  const img = event.target.closest('.prose img')
  if (img && img.src) {
    openImageModal(img.src)
  }
}

// Example suggestions (simplified)
const suggestions = [
  {
    emoji: '🌡️',
    title: 'Climate Science',
    question: 'What are the main causes of global warming?'
  },
  {
    emoji: '🌿',
    title: 'Sustainable Solutions',
    question: 'How can I reduce my carbon footprint?'
  },
  {
    emoji: '🏭',
    title: 'Industry Impact',
    question: 'Which industries contribute most to emissions?'
  },
  {
    emoji: '🌊',
    title: 'Ocean Impact',
    question: 'How does climate change affect oceans?'
  },
  {
    emoji: '🔋',
    title: 'Clean Energy',
    question: 'What are the best renewable energy technologies?'
  },
  {
    emoji: '🌳',
    title: 'Forest Conservation',
    question: 'How does deforestation impact climate change?'
  }
]

// Clear caches when thread changes
watch(() => props.selectedThread, () => {
  contentCache.clear()
  dateFormatCache.clear()
  expandedSourceTypes.value.clear()
  
  nextTick(scrollToBottom)
})

// Watch for changes in image inclusion setting
watch(() => props.includeImages, () => {
  // Clear the content cache when image setting changes
  contentCache.clear()
})

// Watch for changes in processing state (concise/detailed mode)
watch(() => props.processingState, () => {
  // Clear the content cache when mode changes
  contentCache.clear()
})

// Watch for new messages and scroll to bottom
watch(() => props.messages.length, () => {
  nextTick(scrollToBottom)
})

onMounted(() => {
  // Clear cache to ensure fresh rendering with current settings
  contentCache.clear()
  
  // Scroll to bottom
  scrollToBottom()
})
</script>

<style>
/* Refined styling for markdown content */
.prose {
  @apply text-gray-700;
}

.prose pre {
  @apply bg-gray-50 rounded-lg p-3 my-2 overflow-x-auto border border-gray-100;
}

.prose code {
  @apply bg-gray-50 rounded px-1 py-0.5 text-gray-700;
}

.prose pre code {
  @apply bg-transparent p-0;
}

.prose ul {
  @apply list-disc my-2 pl-5;
}

.prose ol {
  @apply list-decimal my-2 pl-5;
}

.prose h1, .prose h2, .prose h3, .prose h4 {
  @apply font-semibold my-2 text-gray-800;
}

.prose h1 {
  @apply text-xl;
}

.prose h2 {
  @apply text-lg;
}
    
.prose h3 {
  @apply text-base;
}

.prose a {
  @apply text-blue-600 hover:underline;
}

.prose blockquote {
  @apply border-l-4 border-gray-200 pl-4 italic my-2;
}

/* Hardware acceleration for smoother animations */
.messagesContainer {
  -webkit-overflow-scrolling: touch;
  will-change: transform;
}

/* Optimize images */
img {
  @apply rounded-lg my-2;
  max-width: 100%;
  height: auto;
}

/* Simplify animations */
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.delay-75 {
  animation-delay: 0.15s;
}

.delay-150 {
  animation-delay: 0.3s;
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .prose {
    font-size: 0.875rem;
  }
  
  .prose pre {
    padding: 0.5rem;
    font-size: 0.75rem;
  }
  
  .prose h1 {
    font-size: 1.25rem;
  }
  
  .prose h2 {
    font-size: 1.125rem;
  }
  
  .prose h3 {
    font-size: 1rem;
  }
  
  /* Touch-friendly elements */
  .overscroll-contain {
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  
  /* Better tap targets */
  button {
    min-height: 36px;
    touch-action: manipulation;
  }
}

/* Make images within prose clickable */
.prose img {
  @apply cursor-pointer;
}

.prose a.citation-link {
  @apply bg-blue-50 rounded px-1.5 py-0.5 text-blue-600 font-medium hover:bg-blue-100 transition-colors border border-blue-100;
  text-decoration: none;
  margin: 0 1px;
}

.prose a.citation-link:hover {
  text-decoration: none;
}

/* Enhance reference number styling */
.reference-number {
  @apply bg-blue-50 px-1.5 py-0.5 rounded-md text-blue-700 font-medium border border-blue-100 inline-block;
  min-width: 2.5rem;
  text-align: center;
}

.image-reference-number {
  @apply bg-purple-50 px-1.5 py-0.5 rounded-md text-purple-700 font-medium border border-purple-100 inline-block;
  min-width: 3rem;
  text-align: center;
}

.vector-reference-number {
  @apply bg-teal-50 px-1.5 py-0.5 rounded-md text-teal-700 font-medium border border-teal-100 inline-block;
  min-width: 3rem;
  text-align: center;
}
</style>

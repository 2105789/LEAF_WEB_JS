<!-- Chat Messages Component -->
<template>
  <div class="flex-1 overflow-y-auto bg-gray-50" ref="messagesContainer">
    <!-- Empty state with suggestions -->
    <div v-if="selectedThread && messages.length === 0" class="h-full flex items-center justify-center">
      <div class="max-w-4xl w-full mx-auto p-4 space-y-6 -mt-20">
        <h3 class="text-center text-lg text-gray-600 mb-6">Here are some suggestions to get started:</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="(suggestion, index) in suggestions" 
            :key="index"
            @click="handleSuggestionClick(suggestion)"
            class="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:border-teal-200 hover:shadow transition-all cursor-pointer transform hover:-translate-y-1"
          >
            <div class="text-2xl mb-2">{{ suggestion.emoji }}</div>
            <h4 class="font-medium text-gray-900 mb-2">{{ suggestion.title }}</h4>
            <p class="text-sm text-gray-600">{{ suggestion.question }}</p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Messages with optimized rendering -->
    <div v-else-if="selectedThread" class="p-4 space-y-4">
      <div 
        v-for="message in optimizedMessages" 
        :key="message.id"
        class="max-w-3xl mx-auto"
      >
        <div 
          :class="[
            'rounded-lg shadow-sm relative group transition-all py-3',
            message.role === 'user' 
              ? 'bg-teal-50 border border-teal-100' 
              : 'bg-white border border-gray-100'
          ]"
        >
          <div class="flex items-start gap-3 p-3">
            <!-- Avatar -->
            <div 
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
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
              <div v-if="message.role === 'assistant' && hasAnySources(message.content)" class="mt-3 space-y-2">
                <!-- Web Sources -->
                <div v-if="hasSources(message.content, 'web')" class="border rounded-lg overflow-hidden">
                  <button 
                    @click="toggleSourceType(message.id, 'web')"
                    class="w-full px-3 py-2 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span class="font-medium text-sm">Web Sources ({{ countSources(message.content, 'web') }})</span>
                    <svg 
                      class="w-4 h-4 transform transition-transform"
                      :class="isSourceTypeExpanded(message.id, 'web') ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="isSourceTypeExpanded(message.id, 'web')" class="px-3 py-2 border-t text-sm">
                    <ul class="space-y-1 text-sm pl-2">
                      <li v-for="(source, i) in getSourcesIfExpanded(message.content, 'web')" :key="i">
                        <a v-if="isValidUrl(source)" :href="extractUrl(source)" target="_blank" rel="noopener noreferrer" 
                           class="text-blue-600 hover:text-blue-800 hover:underline text-xs block truncate">
                          {{ formatSource(source).title || formatSource(source).url }}
                        </a>
                        <span v-else>{{ source }}</span>
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
                    <span class="font-medium text-sm">Image Sources ({{ countSources(message.content, 'image') }})</span>
                    <svg 
                      class="w-4 h-4 transform transition-transform"
                      :class="isSourceTypeExpanded(message.id, 'image') ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="isSourceTypeExpanded(message.id, 'image')" class="px-3 py-2 border-t text-sm">
                    <ul class="space-y-1 text-sm pl-2">
                      <li v-for="(source, i) in getSourcesIfExpanded(message.content, 'image')" :key="i">
                        <a v-if="isValidUrl(source)" :href="extractUrl(source)" target="_blank" rel="noopener noreferrer" 
                           class="text-blue-600 hover:text-blue-800 hover:underline text-xs block truncate">
                          {{ formatSource(source).title || formatSource(source).url }}
                        </a>
                        <span v-else>{{ source }}</span>
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
                    <span class="font-medium text-sm">Document Sources ({{ countSources(message.content, 'vector') }})</span>
                    <svg 
                      class="w-4 h-4 transform transition-transform"
                      :class="isSourceTypeExpanded(message.id, 'vector') ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="isSourceTypeExpanded(message.id, 'vector')" class="px-3 py-2 border-t text-sm">
                    <ul class="space-y-2 text-sm pl-2">
                      <li v-for="(source, i) in getSourcesIfExpanded(message.content, 'vector')" :key="i" class="pt-1">
                        {{ source }}
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
    <div v-if="isLoading" class="max-w-3xl mx-auto p-4">
      <div class="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 text-sm shrink-0">
            {{ processingState === 'research' ? '🔍' : '⚡' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <div class="flex space-x-1">
                <div class="h-2 w-2 bg-teal-300 rounded-full animate-pulse"></div>
                <div class="h-2 w-2 bg-teal-300 rounded-full animate-pulse delay-75"></div>
                <div class="h-2 w-2 bg-teal-300 rounded-full animate-pulse delay-150"></div>
              </div>
              <span class="text-sm text-gray-500 ml-2">
                {{ processingState === 'research' ? 'Researching' : 'Generating' }}... {{ processingTime }}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- No Thread Selected State -->
    <div v-if="!selectedThread" class="h-full flex items-center justify-center p-4">
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100 max-w-md w-full text-center">
        <div class="text-4xl mb-4">💬</div>
        <h3 class="text-xl font-medium text-gray-900 mb-2">Select a Thread</h3>
        <p class="text-gray-500">Choose an existing thread from the sidebar or create a new one to start chatting.</p>
      </div>
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
  }
})

const emit = defineEmits(['copy-success', 'copy-error', 'submit'])
const messagesContainer = ref(null)
const expandedSourceTypes = ref(new Map())
const contentCache = new Map()
const dateFormatCache = new Map()

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
  return match[1].trim().split('\n').filter(line => line.trim())
}

// Count sources by type
const countSources = (content, type) => {
  return getSourcesIfExpanded(content, type).length
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
  // Remove any leading [IX] index
  const withoutIndex = source.replace(/^\[[^\]]+\]\s*/, '')
  // Get the text before the URL
  const url = extractUrl(source)
  let title = withoutIndex
  if (url) {
    title = withoutIndex.split(url)[0].trim()
  }
  return { title, url }
}

// Process content with optimized markdown rendering
const getProcessedContent = (message) => {
  const cacheKey = message.id + '-' + message.content
  
  if (contentCache.has(cacheKey)) {
    return contentCache.get(cacheKey)
  }
  
  // Remove source sections from display
  const cleanContent = message.content
    .replace(/<websources>[^]*?<\/websources>/s, '')
    .replace(/<imagesources>[^]*?<\/imagesources>/s, '')
    .replace(/<vectorsources>[^]*?<\/vectorsources>/s, '')
    
  // Render markdown
  const rendered = DOMPurify.sanitize(md.render(cleanContent))
  
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

// Watch for new messages and scroll to bottom
watch(() => props.messages.length, () => {
  nextTick(scrollToBottom)
})

onMounted(() => {
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
</style>

<!-- Chat Messages Component -->
<template>
  <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50" ref="messagesContainer">
    <template v-if="selectedThread">
      <div v-if="messages.length === 0" class="h-full flex items-center justify-center">
        <div class="max-w-5xl w-full mx-auto space-y-6 -mt-20">
          <h3 class="text-center text-lg text-gray-600 mb-8">Here are some suggestions to get started:</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
            <div 
              v-for="(suggestion, index) in suggestions" 
              :key="index"
              @click="handleSuggestionClick(suggestion)"
              class="bg-white p-6 rounded-lg shadow-sm border border-gray-100 hover:border-teal-200 hover:shadow-md transition-all cursor-pointer transform hover:-translate-y-1"
            >
              <div class="text-3xl mb-3">{{ suggestion.emoji }}</div>
              <h4 class="font-medium text-gray-900 mb-2">{{ suggestion.title }}</h4>
              <p class="text-sm text-gray-600">{{ suggestion.question }}</p>
            </div>
          </div>
        </div>
      </div>
      <div 
        v-else
        v-for="message in messages" 
        :key="message.id"
        class="max-w-4xl mx-auto"
      >
        <div 
          :class="[
            'rounded-lg shadow-sm relative group transition-all duration-300 pr-10 py-3',
            message.role === 'user' 
              ? 'bg-teal-50 bg-opacity-50 border border-teal-100' 
              : 'bg-white border border-gray-100',
            message.isProcessing ? 'opacity-75' : 'opacity-100'
          ]"
        >
          <div class="flex items-start gap-3 p-4">
            <div 
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
              :class="message.role === 'user' ? 'bg-teal-100 text-teal-600' : 'bg-emerald-50 text-emerald-600'"
            >
              {{ message.role === 'user' ? 'U' : 'L' }}
            </div>
            <div class="flex-1 min-w-0">
              <div 
                class="prose prose-sm max-w-none"
                :class="[
                  message.role === 'user' 
                    ? 'prose-pre:bg-teal-50 prose-pre:border prose-pre:border-teal-100 text-teal-900' 
                    : 'prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-100 text-gray-700'
                ]"
                v-html="processContent(message.content)"
              ></div>

              <!-- Sources Sections -->
              <div v-if="message.role === 'assistant'" class="mt-4 space-y-2">
                <!-- Web Sources -->
                <div v-if="extractSources(message.content, 'web').length" class="border rounded-lg">
                  <button 
                    @click="sourcesExpanded.web = !sourcesExpanded.web"
                    class="w-full px-4 py-2 text-left flex justify-between items-center hover:bg-gray-50"
                  >
                    <span class="font-medium text-sm">Web Sources</span>
                    <svg 
                      class="w-5 h-5 transform transition-transform"
                      :class="sourcesExpanded.web ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="sourcesExpanded.web" class="px-4 py-2 border-t">
                    <ul class="space-y-2 text-sm">
                      <li v-for="(source, index) in extractSources(message.content, 'web')" :key="index" class="whitespace-normal break-all py-1">
                        <template v-if="source.includes('http')">
                          <div class="flex flex-col gap-1">
                            <span class="font-medium text-gray-700">{{ formatSource(source).title }}</span>
                            <a :href="formatSource(source).url" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 text-xs">
                              {{ formatSource(source).url }}
                            </a>
                          </div>
                        </template>
                        <template v-else>
                          {{ source }}
                        </template>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Image Sources -->
                <div v-if="extractSources(message.content, 'image').length" class="border rounded-lg">
                  <button 
                    @click="sourcesExpanded.image = !sourcesExpanded.image"
                    class="w-full px-4 py-2 text-left flex justify-between items-center hover:bg-gray-50"
                  >
                    <span class="font-medium text-sm">Image Sources</span>
                    <svg 
                      class="w-5 h-5 transform transition-transform"
                      :class="sourcesExpanded.image ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="sourcesExpanded.image" class="px-4 py-2 border-t">
                    <ul class="space-y-2 text-sm">
                      <li v-for="(source, index) in extractSources(message.content, 'image')" :key="index" class="whitespace-normal break-all py-1">
                        <template v-if="source.includes('http')">
                          <div class="flex flex-col gap-1">
                            <span class="font-medium text-gray-700">{{ formatSource(source).title }}</span>
                            <a :href="formatSource(source).url" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 text-xs">
                              {{ formatSource(source).url }}
                            </a>
                          </div>
                        </template>
                        <template v-else>
                          {{ source }}
                        </template>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Vector Sources -->
                <div v-if="extractSources(message.content, 'vector').length" class="border rounded-lg">
                  <button 
                    @click="sourcesExpanded.vector = !sourcesExpanded.vector"
                    class="w-full px-4 py-2 text-left flex justify-between items-center hover:bg-gray-50"
                  >
                    <span class="font-medium text-sm">Vector Sources</span>
                    <svg 
                      class="w-5 h-5 transform transition-transform"
                      :class="sourcesExpanded.vector ? 'rotate-180' : ''"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </button>
                  <div v-show="sourcesExpanded.vector" class="px-4 py-2 border-t">
                    <ul class="space-y-2 text-sm">
                      <li v-for="(source, index) in extractSources(message.content, 'vector')" :key="index" class="whitespace-normal break-all py-1">
                        <template v-if="source.includes('http')">
                          <div class="flex flex-col gap-1">
                            <span class="font-medium text-gray-700">{{ formatSource(source).title }}</span>
                            <a :href="formatSource(source).url" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 text-xs">
                              {{ formatSource(source).url }}
                            </a>
                          </div>
                        </template>
                        <template v-else>
                          {{ source }}
                        </template>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <span class="text-xs mt-2 block" :class="message.role === 'user' ? 'text-teal-400' : 'text-gray-400'">
                {{ formatDate(message.createdAt) }}
              </span>
            </div>
            <button 
              v-if="message.role === 'assistant' && !message.isProcessing"
              @click="copyToClipboard(message.content)"
              class="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              title="Copy response"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            </button>
          </div>
          <div 
            v-if="message.role === 'assistant' && hasCodeBlock(message.content) && !message.isProcessing"
            class="border-t border-gray-50 bg-gray-50 p-2 rounded-b-lg flex justify-end"
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

      <!-- Processing States -->
      <div v-if="isLoading" class="max-w-3xl mx-auto space-y-4">
        <!-- Initializing -->
        <div v-if="processingState === 'initializing'" class="bg-white border border-gray-100 rounded-lg shadow-sm p-4 transition-all duration-300">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 text-sm shrink-0">
              💭
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-400 ml-2 animate-pulse">Thinking...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Research Processing -->
        <div v-if="processingState === 'research'" class="bg-white border border-gray-100 rounded-lg shadow-sm p-4 transition-all duration-300">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 text-sm shrink-0">
              🔬
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <div class="h-4 w-4 bg-teal-100 rounded-full animate-pulse"></div>
                <div class="h-4 w-4 bg-teal-100 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                <div class="h-4 w-4 bg-teal-100 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
                <span class="text-sm text-gray-400 ml-2">Researching... {{ processingTime }}s</span>
              </div>
              <div class="mt-2 space-y-2">
                <div class="h-4 bg-teal-50 rounded w-3/4 animate-pulse"></div>
                <div class="h-4 bg-teal-50 rounded w-1/2 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- General Processing -->
        <div v-if="processingState === 'general'" class="bg-white border border-gray-100 rounded-lg shadow-sm p-4 transition-all duration-300">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 text-sm shrink-0">
              ⚡
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <div class="h-4 w-4 bg-emerald-100 rounded-full animate-pulse"></div>
                <div class="h-4 w-4 bg-emerald-100 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                <div class="h-4 w-4 bg-emerald-100 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
                <span class="text-sm text-gray-400 ml-2">Generating response... {{ processingTime }}s</span>
              </div>
              <div class="mt-2 space-y-2">
                <div class="h-4 bg-emerald-50 rounded w-3/4 animate-pulse"></div>
                <div class="h-4 bg-emerald-50 rounded w-1/2 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="h-full flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow-sm border border-gray-100 max-w-md w-full text-center">
        <div class="text-4xl mb-4">💬</div>
        <h3 class="text-xl font-medium text-gray-900 mb-2">Select a Thread</h3>
        <p class="text-gray-500">Choose an existing thread from the sidebar or create a new one to start chatting.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import markdownItSup from 'markdown-it-sup'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true
}).use(markdownItSup)

// Custom renderer for references
md.renderer.rules.reference = (tokens, idx) => {
  const token = tokens[idx]
  return `<sup class="reference">[${token.meta.id}]</sup>`
}

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
    default: 'web-search'
  }
})

const emit = defineEmits(['copy-success', 'copy-error', 'submit'])
const messagesContainer = ref(null)
const sourcesExpanded = ref({
  web: false,
  image: false,
  vector: false
})

// Format date helper
const formatDate = (date) => {
  return new Date(date).toLocaleString()
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

// Extract and format sources
const extractSources = (content, type) => {
  const regex = {
    web: /<websources>([^]*?)<\/websources>/s,
    image: /<imagesources>([^]*?)<\/imagesources>/s,
    vector: /<vectorsources>([^]*?)<\/vectorsources>/s
  }
  const match = content.match(regex[type])
  if (!match) return []
  return match[1].trim().split('\n').filter(line => line.trim())
}

// Extract URL from source string
const extractUrl = (source) => {
  const match = source.match(/(https?:\/\/[^\s]+)/)
  return match ? match[1] : ''
}

// Extract title from source string
const extractTitle = (source) => {
  // Remove any leading [IX] index
  const withoutIndex = source.replace(/^\[[^\]]+\]\s*/, '')
  // Get the text before the URL
  const url = extractUrl(source)
  const titlePart = withoutIndex.split(url)[0].replace(/-\s*$/, '').trim()
  // Limit to 30 characters
  return titlePart.length > 30 ? titlePart.substring(0, 30) + '...' : titlePart
}

// Format source display
const formatSource = (source) => {
  const title = extractTitle(source)
  const url = extractUrl(source)
  return { title, url }
}

// Process content with markdown
const processContent = (content) => {
  // Remove source sections from display
  const cleanContent = content
    .replace(/<websources>[^]*?<\/websources>/s, '')
    .replace(/<imagesources>[^]*?<\/imagesources>/s, '')
    .replace(/<vectorsources>[^]*?<\/vectorsources>/s, '')
    
  // Convert references [n] to superscript
  const processedContent = cleanContent.replace(/\[(\d+)\]/g, '<sup class="reference">[$1]</sup>')
  
  // Render markdown
  return DOMPurify.sanitize(md.render(processedContent))
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

// Scroll to bottom of messages
const scrollToBottom = () => {
  setTimeout(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  }, 100)
}

// Watch for new messages and scroll to bottom
watch(() => props.messages, () => {
  scrollToBottom()
}, { deep: true })

// Watch for thread changes
watch(() => props.selectedThread, () => {
  scrollToBottom()
})

onMounted(() => {
  scrollToBottom()
})

// Example suggestions
const suggestions = [
  {
    emoji: '🌡️',
    title: 'Climate Science',
    question: 'What are the main causes of global warming and their relative impact on climate change?'
  },
  {
    emoji: '🌿',
    title: 'Sustainable Solutions',
    question: 'What are the most effective ways for individuals to reduce their carbon footprint?'
  },
  {
    emoji: '🏭',
    title: 'Industry Impact',
    question: 'Which industries contribute the most to greenhouse gas emissions and what solutions exist?'
  },
  {
    emoji: '🌊',
    title: 'Ocean Impact',
    question: 'How does climate change affect ocean ecosystems and what are the consequences?'
  },
  {
    emoji: '🔋',
    title: 'Clean Energy',
    question: 'What are the most promising renewable energy technologies for combating climate change?'
  },
  {
    emoji: '🌳',
    title: 'Forest Conservation',
    question: 'How do deforestation and forest conservation impact climate change?'
  }
]

// Handle suggestion click
const handleSuggestionClick = (suggestion) => {
  emit('submit', {
    message: suggestion.question,
    pdfContext: null,
    mode: 'general'
  })
}
</script>

<style>
/* Markdown content styles */
.prose {
  @apply text-gray-700;
}

.prose pre {
  @apply bg-gray-50 rounded-lg p-4 my-2 overflow-x-auto border border-gray-100;
}

.prose code {
  @apply bg-gray-50 rounded px-1 py-0.5 text-gray-700;
}

.prose pre code {
  @apply bg-transparent p-0;
}


.prose ul{
  @apply list-disc list-inside my-2;
}

.prose ol {
  @apply list-decimal list-inside my-2;
}

.prose h1, .prose h2, .prose h3, .prose h4 {
  @apply font-semibold my-3 text-gray-800;
}

.prose h1 {
  @apply text-2xl;
}

.prose h2 {
  @apply text-xl;
}
    
.prose h3 {
  @apply text-lg;
}

.prose a {
  @apply text-blue-600 hover:text-blue-800;
}

.prose blockquote {
  @apply border-l-4 border-gray-200 pl-4 italic;
}

.prose hr {
  @apply my-4 border-gray-200;
}

/* Reference styling */
.reference {
  @apply text-xs text-teal-600 font-medium ml-0.5 bg-teal-50 px-1 py-0.5 rounded;
}

/* Sources sections styling */
.sources-section {
  @apply mt-4 border rounded-lg overflow-hidden;
}

.sources-header {
  @apply px-4 py-2 bg-gray-50 font-medium text-sm flex justify-between items-center cursor-pointer hover:bg-gray-100;
}

.sources-content {
  @apply px-4 py-2 text-sm space-y-1;
}

/* Raw message content styles */
pre {
  @apply whitespace-pre-wrap font-sans text-sm;
  @apply bg-transparent border-0 p-0 m-0;
  @apply overflow-x-auto;
}

pre.text-teal-900 {
  @apply font-medium;
}

/* References section styling */
h2:contains("References"), h2:contains("References") + p {
  @apply border-t border-gray-100 pt-4 mt-6;
}

h2:contains("References") {
  @apply text-lg font-medium text-gray-700;
}

h2:contains("References") + p, 
h2:contains("References") ~ p {
  @apply text-sm text-gray-600 my-1 break-words leading-relaxed;
}

h2:contains("References") ~ p a {
  @apply text-teal-600 hover:text-teal-700 break-all text-xs;
  word-break: break-all;
}

/* Inline citation styling */
span.inline-block {
  @apply text-xs text-teal-600 font-medium ml-0.5 bg-teal-50 px-1 py-0.5 rounded;
}

/* Ensure proper link wrapping */
a {
  @apply inline-block max-w-full overflow-hidden text-ellipsis;
}

/* Source list items */
.sources-content li {
  @apply py-1 break-all;
}
img{
  margin-top: 20px;
  border-radius: 10px;
}
</style>

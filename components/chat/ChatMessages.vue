<!-- Chat Messages Component -->
<template>
  <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50" ref="messagesContainer">
    <template v-if="selectedThread">
      <div 
        v-for="message in messages" 
        :key="message.id"
        class="max-w-4xl mx-auto"
      >
        <div 
          :class="[
            'rounded-lg shadow-sm relative group transition-all duration-300 pr-10 py-3',
            message.role === 'user' 
              ? 'bg-indigo-50 border border-indigo-100' 
              : 'bg-white border border-gray-100',
            message.isProcessing ? 'opacity-75' : 'opacity-100'
          ]"
        >
          <div class="flex items-start gap-3 p-4">
            <div 
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
              :class="message.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-50 text-emerald-600'"
            >
              {{ message.role === 'user' ? 'U' : 'L' }}
            </div>
            <div class="flex-1 min-w-0">
              <div 
                v-if="message.role === 'assistant'"
                class="prose prose-sm max-w-none prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-100"
                :class="[
                  message.role === 'user' ? 'text-indigo-900' : 'text-gray-700',
                  message.isProcessing ? 'opacity-75' : 'opacity-100'
                ]"
                v-html="markdownToHtml(message.content)"
              ></div>
              <div 
                v-else 
                class="whitespace-pre-wrap text-indigo-900"
              >
                {{ message.content }}
              </div>
              <span class="text-xs mt-2 block" :class="message.role === 'user' ? 'text-indigo-400' : 'text-gray-400'">
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
            <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-sm shrink-0">
              🔬
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <div class="h-4 w-4 bg-indigo-100 rounded-full animate-pulse"></div>
                <div class="h-4 w-4 bg-indigo-100 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                <div class="h-4 w-4 bg-indigo-100 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
                <span class="text-sm text-gray-400 ml-2">Researching... {{ processingTime }}s</span>
              </div>
              <div class="mt-2 space-y-2">
                <div class="h-4 bg-indigo-50 rounded w-3/4 animate-pulse"></div>
                <div class="h-4 bg-indigo-50 rounded w-1/2 animate-pulse"></div>
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
    <div v-else class="text-center text-gray-500 mt-10">
      Select or create a new thread to start chatting
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

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
    default: 'web-search' // 'web-search', 'vector-search', 'ai-processing'
  }
})

const emit = defineEmits(['copy-success', 'copy-error'])
const messagesContainer = ref(null)

// Format date helper
const formatDate = (date) => {
  return new Date(date).toLocaleString()
}

// Markdown to HTML conversion
const markdownToHtml = (content) => {
  return DOMPurify.sanitize(marked(content))
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
</script>

<style>
/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Update markdown content styles */
:deep(.prose) {
  @apply text-gray-700;
}

:deep(.prose pre) {
  @apply bg-gray-50 rounded-lg p-4 my-2 overflow-x-auto border border-gray-100;
}

:deep(.prose code) {
  @apply bg-gray-50 rounded px-1 py-0.5 text-gray-700;
}

:deep(.prose pre code) {
  @apply bg-transparent p-0;
}

:deep(.prose p) {
  @apply my-2;
}

:deep(.prose ul) {
  @apply list-disc list-inside my-2;
}

:deep(.prose ol) {
  @apply list-decimal list-inside my-2;
}

:deep(.prose h1), :deep(.prose h2), :deep(.prose h3), :deep(.prose h4) {
  @apply font-semibold my-3 text-gray-800;
}

:deep(.prose h1) {
  @apply text-2xl;
}

:deep(.prose h2) {
  @apply text-xl;
}

:deep(.prose h3) {
  @apply text-lg;
}

a {
  @apply text-blue-800 hover:text-blue-700;
} 

img {
  @apply rounded-lg;
  margin-top: 10px;
  border: 1px solid #e2e8f0;
  width: 100%;
}

</style>

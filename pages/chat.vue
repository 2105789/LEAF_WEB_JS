<template>
  <div v-if="isInitializing" class="h-screen flex items-center justify-center bg-gray-100">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
  
  <div v-else class="h-screen flex overflow-hidden bg-gray-100">
    <!-- Thread Sidebar -->
    <ThreadSidebar
      :threads="threads"
      :selected-thread="selectedThread"
      :user="user"
      @select-thread="selectThread"
      @create-thread="createNewThread"
      @delete-thread="deleteThread"
      @update-thread="updateThreadTitle"
      @logout="handleLogout"
    />

    <!-- Chat Area -->
    <div class="flex-1 flex flex-col h-full overflow-hidden">
      <!-- Chat Header -->
      <ChatHeader
        :thread="selectedThread"
        @clear="clearThread"
        @update-thread="updateThreadTitle"
        @pdf-upload="handlePdfUpload"
      />

      <!-- Messages Area -->
      <ChatMessages
        ref="messagesContainer"
        :messages="messages"
        :selected-thread="selectedThread"
        :is-loading="isLoading"
        :processing-time="processingTime"
        :processing-state="processingState"
        @copy-success="toast?.addToast('Copied to clipboard!', 'success', 2000)"
        @copy-error="toast?.addToast('Failed to copy text', 'error', 2000)"
        @submit="handleSubmit"
      />

      <!-- Input Area -->
      <ChatInput
        :disabled="!selectedThread"
        :is-loading="isLoading"
        @submit="handleSubmit"
      />
      
      <Toast ref="toast" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount, computed, nextTick } from 'vue'
import { useAuth } from '~/composables/useAuth'
import Toast from '~/components/Toast.vue'
import ThreadSidebar from '~/components/chat/ThreadSidebar.vue'
import ChatHeader from '~/components/chat/ChatHeader.vue'
import ChatMessages from '~/components/chat/ChatMessages.vue'
import ChatInput from '~/components/chat/ChatInput.vue'

definePageMeta({
  middleware: 'auth'
})

const { user, clearAuth, fetchUser } = useAuth()
const isInitializing = ref(true)
const toast = ref(null)
const messagesContainer = ref(null)
const isThreadSwitching = ref(false)

// Scroll to bottom of messages with improved performance
const scrollToBottom = () => {
  if (!messagesContainer.value) return
  
  // Use requestAnimationFrame for smoother scrolling
  requestAnimationFrame(() => {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  })
}

// Watch for user changes
watch(user, (newUser) => {
  if (!newUser) {
    router.push('/login')
  }
})

const threads = ref([])
const selectedThread = ref(null)
const messages = ref([])
const isLoading = ref(false)
const pdfContext = ref(null)

// Processing state management
const processingState = ref('web-search') // 'web-search', 'vector-search', 'ai-processing'

// Stopwatch state
const processingTime = ref(0)
const processingTimer = ref(null)

// Start the stopwatch
const startStopwatch = () => {
  const startTime = Date.now()
  processingTimer.value = setInterval(() => {
    processingTime.value = Math.floor((Date.now() - startTime) / 1000)
  }, 1000)
}

// Stop the stopwatch
const stopStopwatch = () => {
  if (processingTimer.value) {
    clearInterval(processingTimer.value)
    processingTimer.value = null
  }
  processingTime.value = 0
}

// Fetch user's threads with optimized loading
const fetchThreads = async () => {
  try {
    const response = await $fetch('/api/threads', {
      credentials: 'include'
    })
    threads.value = response.threads
  } catch (error) {
    console.error('Error fetching threads:', error)
    toast.value?.addToast('Failed to load threads', 'error', 3000)
  }
}

// Fetch messages for selected thread with optimized loading
const fetchMessages = async (threadId) => {
  try {
    isThreadSwitching.value = true
    const response = await $fetch(`/api/threads/${threadId}/messages`, {
      credentials: 'include'
    })
    
    // Use nextTick to ensure DOM updates are batched
    await nextTick(() => {
      messages.value = response.messages
    })
    
    // Delay scrolling slightly to ensure content is rendered
    setTimeout(scrollToBottom, 50)
  } catch (error) {
    console.error('Error fetching messages:', error)
    toast.value?.addToast('Failed to load messages', 'error', 3000)
  } finally {
    isThreadSwitching.value = false
  }
}

// Create a new thread with optimized UI feedback
const createNewThread = async () => {
  try {
    const title = `New Chat ${new Date().toLocaleString()}`
    const response = await $fetch('/api/threads', {
      method: 'POST',
      body: { title },
      credentials: 'include'
    })
    
    // Add to beginning of array with animation preparation
    threads.value = [response.thread, ...threads.value]
    
    // Select the thread after a short delay to allow for animation
    setTimeout(() => {
      selectThread(response.thread)
    }, 50)
  } catch (error) {
    console.error('Error creating thread:', error)
    toast.value?.addToast('Failed to create new thread', 'error', 3000)
  }
}

// Select a thread with improved state management
const selectThread = async (thread) => {
  if (selectedThread.value?.id === thread.id) return
  
  selectedThread.value = thread
  messages.value = [] // Clear messages immediately for better UX
  await fetchMessages(thread.id)
}

// Clear thread messages
const clearThread = async () => {
  if (!selectedThread.value) return
  if (!confirm('Are you sure you want to clear all messages in this thread?')) return
  
  try {
    await $fetch(`/api/threads/${selectedThread.value.id}/messages`, {
      method: 'DELETE',
      credentials: 'include'
    })
    messages.value = []
  } catch (error) {
    console.error('Error clearing thread:', error)
  }
}

// Delete thread
const deleteThread = async (thread) => {
  if (!confirm('Are you sure you want to delete this thread?')) return
  
  try {
    await $fetch(`/api/threads/${thread.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    threads.value = threads.value.filter(t => t.id !== thread.id)
    if (selectedThread.value?.id === thread.id) {
      selectedThread.value = null
      messages.value = []
    }
  } catch (error) {
    console.error('Error deleting thread:', error)
  }
}

// Update thread title
const updateThreadTitle = async ({ id, title }) => {
  try {
    const response = await $fetch(`/api/threads/${id}`, {
      method: 'PUT',
      body: { title },
      credentials: 'include'
    })

    // Update the thread in the list
    const index = threads.value.findIndex(t => t.id === id)
    if (index !== -1) {
      threads.value[index] = response.thread
      if (selectedThread.value?.id === response.thread.id) {
        selectedThread.value = response.thread
      }
    }
  } catch (error) {
    console.error('Error updating thread title:', error)
  }
}

// Handle PDF upload
const handlePdfUpload = async (formData) => {
  try {
    const reader = new FileReader()
    const file = formData.get('pdf')
    
    reader.onload = async (e) => {
      pdfContext.value = e.target.result
      toast.value?.addToast('PDF loaded successfully', 'success', 2000)
    }
    
    reader.readAsArrayBuffer(file)
  } catch (error) {
    console.error('Error processing PDF:', error)
    toast.value?.addToast('Failed to process PDF', 'error', 3000)
  }
}

// Handle new message submission
const handleSubmit = async (messageData) => {
  if (!selectedThread.value || !messageData.message.trim() || isLoading.value) return
  
  isLoading.value = true
  startStopwatch()
  processingState.value = 'initializing'

  try {
    // Add temporary message
    const tempMessageId = Date.now()
    messages.value.push({
      id: tempMessageId,
      content: messageData.message,
      role: 'user',
      createdAt: new Date().toISOString(),
      isTemp: true
    })

    // Send message to API
    const response = await $fetch('/api/chat', {
      method: 'POST',
      body: {
        threadId: selectedThread.value.id,
        message: messageData.message,
        pdfContext: messageData.pdfContext,
        mode: messageData.mode
      }
    })

    // Update processing state from backend
    processingState.value = response.processingState

    // Remove temp message and add both messages from response
    messages.value = messages.value.filter(m => !m.isTemp)
    
    // Add messages with processing state
    response.messages.forEach(msg => {
      if (msg.role === 'assistant') {
        msg.isProcessing = true
      }
      messages.value.push(msg)
    })

    // Simulate final processing (500ms)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Update messages to remove processing state
    messages.value = messages.value.map(msg => ({
      ...msg,
      isProcessing: false
    }))
    
    scrollToBottom()
  } catch (error) {
    console.error('Error sending message:', error)
    messages.value = messages.value.filter(m => !m.isTemp)
    toast.value?.addToast(error?.data?.error || 'Failed to send message', 'error', 3000)
  } finally {
    isLoading.value = false
    stopStopwatch()
  }
}

// Handle logout
const handleLogout = async () => {
  if (confirm('Are you sure you want to logout?')) {
    await clearAuth()
  }
}

// Watch for thread changes with debounce
watch(() => selectedThread.value, async (newThread, oldThread) => {
  if (!newThread) {
    messages.value = []
    return
  }

  if (newThread?.id !== oldThread?.id) {
    pdfContext.value = null
  }
}, { deep: true })

// Initial load with improved sequence
onMounted(async () => {
  try {
    await fetchUser()
    await fetchThreads()
    isInitializing.value = false
  } catch (error) {
    console.error('Error initializing:', error)
    isInitializing.value = false
  }
})

// Cleanup on unmount
onBeforeUnmount(() => {
  stopStopwatch()
})
</script> 
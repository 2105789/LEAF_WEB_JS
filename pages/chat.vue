<template>
  <!-- Loading State -->
  <div v-if="isInitializing" class="h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <div class="animate-pulse mb-4">
        <div class="inline-block w-10 h-10 rounded-full bg-teal-100">
          <svg class="w-6 h-6 text-teal-600 mx-auto mt-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
      </div>
      <p class="text-gray-600 text-sm">Loading your workspace...</p>
    </div>
  </div>
  
  <!-- Main Chat Interface -->
  <div v-else class="h-screen flex overflow-hidden bg-gray-50">
    <!-- Thread Sidebar - Hidden on mobile, visible with overlay when open -->
    <div 
      :class="[
        'transition-all duration-300 ease-in-out z-30',
        'md:relative md:z-auto md:block',
        isSidebarOpen ? 'block absolute inset-0 bg-black/30' : 'hidden'
      ]"
      @click="isSidebarOpen = false"
    >
      <div 
        class="w-64 h-full md:w-64 bg-white flex flex-col"
        :class="isSidebarOpen ? 'shadow-xl' : 'md:shadow-none'"
        @click.stop
      >
        <ThreadSidebar
          :threads="threads"
          :selected-thread="selectedThread"
          :user="user"
          @select-thread="selectThread"
          @create-thread="createNewThread"
          @delete-thread="deleteThread"
          @update-thread="updateThreadTitle"
          @logout="handleLogout"
          @close-sidebar="isSidebarOpen = false"
        />
      </div>
    </div>

    <!-- Chat Area -->
    <div class="flex-1 flex flex-col h-full overflow-hidden">
      <!-- Chat Header with Mobile Sidebar Toggle -->
      <div class="flex items-center bg-white border-b border-gray-200">
        <!-- Mobile Sidebar Toggle -->
        <button 
          class="md:hidden p-4 text-gray-500 hover:text-gray-700"
          @click="isSidebarOpen = !isSidebarOpen"
          aria-label="Toggle sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <!-- Chat Header Component -->
        <div class="flex-1">
          <ChatHeader
            :thread="selectedThread"
            @clear="clearThread"
            @update-thread="updateThreadTitle"
          />
        </div>
      </div>

      <!-- Messages Area -->
      <ChatMessages
        ref="messagesContainer"
        :messages="messages"
        :selected-thread="selectedThread"
        :is-loading="isLoading"
        :processing-time="processingTime"
        :processing-state="processingState"
        @copy-success="showToast('Copied to clipboard!', 'success')"
        @copy-error="showToast('Failed to copy text', 'error')"
        @submit="handleSubmit"
      />

      <!-- Input Area -->
      <ChatInput
        :disabled="!selectedThread || isLoading"
        :is-loading="isLoading"
        @submit="handleSubmit"
      />
    </div>
    
    <!-- Toast Notifications -->
    <div class="fixed bottom-4 right-4 z-50">
      <div 
        v-for="(toast, index) in toasts" 
        :key="toast.id"
        class="mb-2 px-4 py-2 rounded-lg shadow-lg text-sm transition-all transform translate-y-0 opacity-100 max-w-[90vw] md:max-w-md"
        :class="[
          toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
          toast.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 
          'bg-blue-50 text-blue-800 border border-blue-200'
        ]"
      >
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount, nextTick } from 'vue'
import { useAuth } from '~/composables/useAuth'
import ThreadSidebar from '~/components/chat/ThreadSidebar.vue'
import ChatHeader from '~/components/chat/ChatHeader.vue'
import ChatMessages from '~/components/chat/ChatMessages.vue'
import ChatInput from '~/components/chat/ChatInput.vue'

// Auth middleware
definePageMeta({
  middleware: 'auth'
})

// Initialize auth
const { user, clearAuth, fetchUser } = useAuth()
const router = useRouter()

// App state
const isInitializing = ref(true)
const messagesContainer = ref(null)
const threads = ref([])
const selectedThread = ref(null)
const messages = ref([])
const isLoading = ref(false)
const processingState = ref('general') 
const processingTime = ref(0)
const processingTimer = ref(null)
const isSidebarOpen = ref(false) // Track sidebar state for mobile

// Toast notifications system
const toasts = ref([])
const showToast = (message, type = 'info', duration = 3000) => {
  const id = Date.now()
  toasts.value.push({ id, message, type })
  
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, duration)
}

// Stopwatch functions
const startStopwatch = () => {
  const startTime = Date.now()
  stopStopwatch() // Clear any existing timer
  
  processingTimer.value = setInterval(() => {
    processingTime.value = Math.floor((Date.now() - startTime) / 1000)
  }, 1000)
}

const stopStopwatch = () => {
  if (processingTimer.value) {
    clearInterval(processingTimer.value)
    processingTimer.value = null
  }
  processingTime.value = 0
}

// Fetch user's threads
const fetchThreads = async () => {
  try {
    const response = await $fetch('/api/threads', {
      credentials: 'include'
    })
    threads.value = response.threads
    
    // Select first thread if available and none is selected
    if (threads.value.length > 0 && !selectedThread.value) {
      await selectThread(threads.value[0])
    }
  } catch (error) {
    console.error('Error fetching threads:', error)
    showToast('Could not load your conversations', 'error')
  }
}

// Fetch messages for selected thread
const fetchMessages = async (threadId) => {
  try {
    const response = await $fetch(`/api/threads/${threadId}/messages`, {
      credentials: 'include'
    })
    
    messages.value = response.messages
    
    // Ensure message container scrolls to bottom
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollToBottom()
      }
    })
    
    // Auto-close sidebar on mobile after selecting a thread
    isSidebarOpen.value = false
  } catch (error) {
    console.error('Error fetching messages:', error)
    showToast('Could not load messages', 'error')
  }
}

// Create a new thread
const createNewThread = async () => {
  try {
    const tempId = `temp-${Date.now()}`
    const title = `New Chat ${new Date().toLocaleTimeString()}`
    
    // Optimistically add the thread to the list
    const tempThread = {
      id: tempId,
      title,
      createdAt: new Date().toISOString(),
      isTemp: true
    }
    
    threads.value = [tempThread, ...threads.value]
    
    // Optimistically select the thread
    selectedThread.value = tempThread
    messages.value = [] // Clear messages immediately
    
    // Auto-close sidebar on mobile after creating a thread
    isSidebarOpen.value = false
    
    // Then perform the actual API call
    const response = await $fetch('/api/threads', {
      method: 'POST',
      body: { title },
      credentials: 'include'
    })
    
    // Replace the temporary thread with the real one
    const index = threads.value.findIndex(t => t.id === tempId)
    if (index !== -1) {
      threads.value[index] = response.thread
      
      // Update selected thread if needed
      if (selectedThread.value.id === tempId) {
        selectedThread.value = response.thread
      }
    }
    
    showToast('New conversation created', 'success')
  } catch (error) {
    console.error('Error creating thread:', error)
    
    // Remove the temporary thread
    threads.value = threads.value.filter(t => !t.isTemp)
    
    // Reset selected thread if needed
    if (selectedThread.value?.isTemp) {
      selectedThread.value = threads.value.length > 0 ? threads.value[0] : null
    }
    
    showToast('Failed to create new conversation', 'error')
  }
}

// Select a thread
const selectThread = async (thread) => {
  if (selectedThread.value?.id === thread.id) {
    // Just close the sidebar if it's the same thread
    isSidebarOpen.value = false
    return
  }
  
  // Store previous thread for fallback
  const previousThread = selectedThread.value
  
  // Update UI immediately
  selectedThread.value = thread
  messages.value = [] // Clear messages for instant feedback
  
  try {
    // Add a subtle loading indicator on the thread item
    thread.isLoading = true
    
    // Then fetch the actual messages
    const response = await $fetch(`/api/threads/${thread.id}/messages`, {
      credentials: 'include'
    })
    
    messages.value = response.messages
    
    // Remove loading state
    thread.isLoading = false
    
    // Close sidebar on mobile
    isSidebarOpen.value = false
    
    // Ensure message container scrolls to bottom
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollToBottom()
      }
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    
    // Revert to previous thread if there was an error
    if (previousThread) {
      selectedThread.value = previousThread
      await fetchMessages(previousThread.id).catch(() => {}) // Silent fallback
    }
    
    showToast('Could not load messages', 'error')
    
    // Remove loading state
    thread.isLoading = false
  }
}

// Delete thread
const deleteThread = async (thread) => {
  try {
    // Store thread for potential restoration
    const threadToDelete = { ...thread }
    const threadIndex = threads.value.indexOf(thread)
    
    // Optimistically remove from list
    threads.value = threads.value.filter(t => t.id !== thread.id)
    
    // Handle if current thread was deleted
    if (selectedThread.value?.id === thread.id) {
      selectedThread.value = threads.value.length > 0 ? threads.value[0] : null
      messages.value = []
      
      // Load messages if we auto-selected another thread
      if (selectedThread.value) {
        fetchMessages(selectedThread.value.id).catch(() => {}) // Silent fallback
      }
    }
    
    // Then perform the actual delete
    await $fetch(`/api/threads/${thread.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    showToast('Conversation deleted', 'success')
  } catch (error) {
    console.error('Error deleting thread:', error)
    
    // Restore the thread if deletion failed
    if (threadToDelete) {
      if (threadIndex >= 0) {
        threads.value.splice(threadIndex, 0, threadToDelete)
      } else {
        threads.value.push(threadToDelete)
      }
    }
    
    showToast('Failed to delete conversation', 'error')
  }
}

// Update thread title
const updateThreadTitle = async ({ id, title }) => {
  // Find thread in list
  const thread = threads.value.find(t => t.id === id)
  if (!thread) return
  
  // Store original title for rollback
  const originalTitle = thread.title
  
  try {
    // Update UI immediately
    thread.title = title
    
    // If it's the selected thread, update that too
    if (selectedThread.value?.id === id) {
      selectedThread.value = { ...selectedThread.value, title }
    }
    
    // Then perform the actual update
    const response = await $fetch(`/api/threads/${id}`, {
      method: 'PUT',
      body: { title },
      credentials: 'include'
    })
    
    // Update with server response (ensures consistency)
    const index = threads.value.findIndex(t => t.id === id)
    if (index !== -1) {
      threads.value[index] = response.thread
      
      // Update selected thread if needed
      if (selectedThread.value?.id === response.thread.id) {
        selectedThread.value = response.thread
      }
    }
    
    showToast('Title updated', 'success')
  } catch (error) {
    console.error('Error updating thread title:', error)
    
    // Rollback to original title if update failed
    if (thread) {
      thread.title = originalTitle
      
      // Rollback selected thread too if needed
      if (selectedThread.value?.id === id) {
        selectedThread.value = { ...selectedThread.value, title: originalTitle }
      }
    }
    
    showToast('Failed to update title', 'error')
  }
}

// Clear thread messages
const clearThread = async () => {
  if (!selectedThread.value) return
  
  // Store messages for potential restoration
  const originalMessages = [...messages.value]
  
  try {
    // Update UI immediately
    messages.value = []
    
    // Then perform the actual clear
    await $fetch(`/api/threads/${selectedThread.value.id}/messages`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    showToast('Conversation cleared', 'success')
  } catch (error) {
    console.error('Error clearing thread:', error)
    
    // Restore messages if clearing failed
    messages.value = originalMessages
    
    showToast('Failed to clear conversation', 'error')
  }
}

// Handle new message submission
const handleSubmit = async (messageData) => {
  if (!selectedThread.value || !messageData.message.trim() || isLoading.value) return
  
  isLoading.value = true
  startStopwatch()
  processingState.value = messageData.mode || 'general'

  try {
    // Add temporary user message
    const tempMessageId = Date.now()
    messages.value.push({
      id: tempMessageId,
      content: messageData.message,
      role: 'user',
      createdAt: new Date().toISOString(),
      isTemp: true
    })

    // Scroll to bottom
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollToBottom()
      }
    })

    // Send message to API
    const response = await $fetch('/api/chat', {
      method: 'POST',
      body: {
        threadId: selectedThread.value.id,
        message: messageData.message,
        pdfContext: messageData.pdfContext,
        mode: messageData.mode || 'general'
      }
    })

    // Update processing state from response
    processingState.value = response.processingState || 'general'

    // Remove temp message and add actual messages from response
    messages.value = messages.value.filter(m => !m.isTemp)
    messages.value.push(...response.messages)
    
    // Scroll to bottom after message received
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollToBottom()
      }
    })
  } catch (error) {
    console.error('Error sending message:', error)
    messages.value = messages.value.filter(m => !m.isTemp)
    
    let errorMessage = 'Failed to send message'
    if (error?.data?.error) {
      errorMessage = error.data.error
    }
    
    showToast(errorMessage, 'error')
  } finally {
    isLoading.value = false
    stopStopwatch()
  }
}

// Handle user logout
const handleLogout = async () => {
  try {
    await clearAuth()
    router.push('/login')
  } catch (error) {
    console.error('Error logging out:', error)
    showToast('Failed to log out', 'error')
  }
}

// Close sidebar when escape key is pressed
const handleEscKey = (e) => {
  if (e.key === 'Escape' && isSidebarOpen.value) {
    isSidebarOpen.value = false
  }
}

// Watch for auth changes
watch(user, (newUser) => {
  if (!newUser) {
    router.push('/login')
  }
})

// Load data on mount
onMounted(async () => {
  try {
    await fetchUser()
    await fetchThreads()
    window.addEventListener('keydown', handleEscKey)
  } catch (error) {
    console.error('Error initializing chat:', error)
    showToast('Failed to load your data', 'error')
  } finally {
    isInitializing.value = false
  }
})

// Clean up on unmount
onBeforeUnmount(() => {
  stopStopwatch()
  window.removeEventListener('keydown', handleEscKey)
})
</script>

<style scoped>
/* Toast animations */
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.toast-enter-active {
  animation: slideUp 0.3s ease-out;
}

.toast-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .h-screen {
    height: 100vh;
    height: calc(var(--vh, 1vh) * 100);
  }
}
</style>

<script>
// Fix for mobile viewport height issues
if (process.client) {
  const setVH = () => {
    const vh = window.innerHeight * 0.01
    document.documentElement.style.setProperty('--vh', `${vh}px`)
  }
  
  window.addEventListener('resize', setVH)
  window.addEventListener('orientationchange', setVH)
  
  // Initial set
  setVH()
}
</script> 
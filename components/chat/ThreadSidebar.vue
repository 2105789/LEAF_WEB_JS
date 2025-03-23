<!-- Thread Sidebar Component -->
<template>
  <div class="w-64 bg-white border-r border-gray-200 flex flex-col h-full relative">
    <!-- Logo Area -->
    <div class="shrink-0 h-14 border-b border-gray-200 flex items-center px-4">
      <img src="/logo.png" alt="Logo" class="h-7 object-contain">
      <span class="ml-2 font-medium text-gray-700">LEAF Chat</span>
    </div>

    <!-- New Thread Button -->
    <div class="p-3">
      <button 
        @click="$emit('create-thread')"
        class="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-md transition-colors flex items-center justify-center gap-2 font-medium text-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
        </svg>
        New Chat
      </button>
    </div>

    <!-- Threads List with virtualization -->
    <div class="overflow-y-auto flex-1 py-2">
      <div v-if="threads.length === 0" class="text-center py-8 text-gray-500 px-4">
        No conversations yet. Start a new chat!
      </div>
      
      <div 
        v-for="thread in threads" 
        :key="thread.id"
        @click="$emit('select-thread', thread)"
        class="mx-2 px-3 py-2 rounded-md cursor-pointer transition-all mb-1 text-sm"
        :class="[
          selectedThread?.id === thread.id 
            ? 'bg-teal-100 text-teal-900' 
            : 'hover:bg-gray-100 text-gray-800'
        ]"
      >
        <div class="flex items-center gap-2">
          <!-- Thread icon with loading state -->
          <div class="relative w-4 h-4 shrink-0">
            <svg v-if="!thread.isLoading" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"
               :class="selectedThread?.id === thread.id ? 'text-teal-600' : 'text-gray-500'"
               viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
            </svg>
            <svg v-else class="animate-spin h-4 w-4 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          
          <div v-if="editingThread?.id === thread.id" class="flex items-center gap-1 flex-1 min-w-0">
            <input 
              v-model="editingThread.title" 
              @keyup.enter="updateThreadTitle"
              @keyup.esc="cancelEditing"
              @click.stop
              ref="titleInput"
              class="flex-1 px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 w-full"
            />
            <button 
              @click.stop="updateThreadTitle"
              class="text-green-600 hover:text-green-700 p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </button>
            <button 
              @click.stop="cancelEditing"
              class="text-red-600 hover:text-red-700 p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
          
          <div v-else class="flex-1 min-w-0">
            <div class="truncate font-medium" :class="{'opacity-60': thread.isTemp}">
              {{ thread.title }}
              <span v-if="thread.isTemp" class="ml-1 text-xs text-teal-600">(creating...)</span>
            </div>
            <div class="text-xs opacity-60">{{ formatDate(thread.createdAt) }}</div>
          </div>
          
          <div v-if="!editingThread && selectedThread?.id === thread.id && !thread.isTemp" class="flex shrink-0 opacity-70">
            <button 
              @click.stop="startEditing(thread)" 
              class="p-1 hover:text-teal-700 transition-colors"
              title="Edit title"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button 
              @click.stop="deleteThread(thread)" 
              class="p-1 hover:text-red-600 transition-colors"
              title="Delete thread"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- User Section -->
    <div class="shrink-0 border-t border-gray-200 p-3">
      <div class="flex items-center justify-between gap-2 rounded-md bg-gray-50 p-2">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium shrink-0">
            {{ user?.email?.charAt(0).toUpperCase() }}
          </div>
          <div class="truncate">
            <div class="text-xs font-medium text-gray-700 truncate">{{ user?.email }}</div>
          </div>
        </div>
        <button 
          @click="$emit('logout')"
          class="text-gray-400 hover:text-gray-700 p-1.5 hover:bg-gray-200 rounded-full transition-colors"
          title="Logout"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 002 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  threads: {
    type: Array,
    required: true
  },
  selectedThread: {
    type: Object,
    default: null
  },
  user: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select-thread', 'create-thread', 'delete-thread', 'update-thread', 'logout'])

const editingThread = ref(null)
const titleInput = ref(null)

// Improved date formatting
const formatDate = (date) => {
  const d = new Date(date)
  const now = new Date()
  
  // If today, show time
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit'
    })
  }
  
  // If this year, show month/day
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric'
    })
  }
  
  // Otherwise show date with year
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Update thread functions
const startEditing = (thread) => {
  // Don't allow editing temp threads
  if (thread.isTemp) return
  
  editingThread.value = { ...thread }
  nextTick(() => {
    if (titleInput.value) {
      titleInput.value.focus()
    }
  })
}

const cancelEditing = () => {
  editingThread.value = null
}

const updateThreadTitle = () => {
  if (!editingThread.value || !editingThread.value.title.trim()) {
    cancelEditing()
    return
  }

  emit('update-thread', {
    id: editingThread.value.id,
    title: editingThread.value.title.trim()
  })
  cancelEditing()
}

// Add a special method for deleting threads with confirmation
const deleteThread = (thread) => {
  // Don't delete temp threads
  if (thread.isTemp) return
  
  // Add confirmation for thread deletion
  if (confirm('Are you sure you want to delete this conversation?')) {
    emit('delete-thread', thread)
  }
}
</script>

<style>
/* Add transitions for smoother UI */
.thread-enter-active,
.thread-leave-active {
  transition: all 0.3s ease;
}

.thread-enter-from,
.thread-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
<!-- Thread Sidebar Component -->
<template>
  <div class="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
    <!-- Logo -->
    <div class="shrink-0 h-14 border-b border-gray-200 flex items-center justify-center">
      <h1 class="text-2xl font-bold text-gray-800">
        <span class="text-blue-600">LEAF</span>
      </h1>
    </div>

    <!-- Threads List -->
    <div class="flex-1 overflow-y-auto">
      <div 
        v-for="thread in threads" 
        :key="thread.id"
        class="p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 group relative"
        :class="{'bg-blue-50': selectedThread?.id === thread.id}"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1" @click="$emit('select-thread', thread)">
            <div v-if="editingThread?.id === thread.id" class="flex items-center gap-2">
              <input 
                v-model="editingThread.title" 
                @keyup.enter="updateThreadTitle"
                @keyup.esc="cancelEditing"
                ref="titleInput"
                class="flex-1 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                :placeholder="thread.title"
              />
              <button 
                @click.stop="updateThreadTitle"
                class="text-green-600 hover:text-green-700"
              >
                ✓
              </button>
              <button 
                @click.stop="cancelEditing"
                class="text-red-600 hover:text-red-700"
              >
                ✕
              </button>
            </div>
            <div v-else>
              <h3 class="font-medium text-gray-900 truncate flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
                </svg>
                {{ thread.title.length > 15 ? thread.title.substring(0, 20) + '...' : thread.title }}
              </h3>
              <p class="text-sm text-gray-500">{{ formatDate(thread.createdAt) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button 
              v-if="!editingThread"
              @click.stop="startEditing(thread)"
              class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-700"
              title="Edit title"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button 
              v-if="!editingThread"
              @click.stop="deleteThread(thread)"
              class="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
              title="Delete thread"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div class="shrink-0 border-t border-gray-200">
      <!-- New Thread Button -->
      <button 
        @click="$emit('create-thread')"
        class="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center gap-2 text-blue-600 border-b border-gray-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
        </svg>
        New Thread
      </button>

      <!-- Profile Section -->
      <div class="p-4 flex items-center gap-3">
        <div 
          class="flex-1 flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
          @click="$router.push('/profile')"
        >
          <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
            {{ user?.email?.charAt(0).toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">
              {{ user?.email }}
            </p>
          </div>
        </div>
        <button 
          @click="$emit('logout')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
          title="Logout"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clip-rule="evenodd" />
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

// Format date helper
const formatDate = (date) => {
  return new Date(date).toLocaleString()
}

// Start editing a thread title
const startEditing = (thread) => {
  editingThread.value = { ...thread }
  nextTick(() => {
    if (titleInput.value) {
      titleInput.value.focus()
    }
  })
}

// Cancel editing
const cancelEditing = () => {
  editingThread.value = null
}

// Update thread title
const updateThreadTitle = async () => {
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

// Delete thread
const deleteThread = async (thread) => {
  emit('delete-thread', thread)
}
</script> 
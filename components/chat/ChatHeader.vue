<!-- Chat Header Component -->
<template>
  <div class="h-14 shrink-0 bg-white border-b border-gray-200 px-2 md:px-4 py-2 flex justify-between items-center w-full">
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <!-- Thread Title -->
      <div v-if="isEditing" class="flex items-center gap-2 flex-1 max-w-xl">
        <input 
          v-model="editedTitle" 
          @keyup.enter="updateTitle"
          @keyup.esc="cancelEditing"
          ref="titleInput"
          class="flex-1 px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 w-full"
          placeholder="Enter conversation title"
        />
        <div class="flex gap-1">
          <button 
            @click="updateTitle"
            class="p-1.5 rounded-md text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
            title="Save title"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </button>
          <button 
            @click="cancelEditing"
            class="p-1.5 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            title="Cancel editing"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      <div v-else-if="thread" class="flex items-center gap-2 flex-1 min-w-0">
        <h2 class="font-medium text-gray-900 truncate text-sm md:text-base">
          {{ thread.title }}
        </h2>
        <button 
          @click="startEditing"
          class="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-50"
          title="Edit title"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
      </div>
      <div v-else class="text-gray-500 text-sm">
        Select a conversation or create a new one
      </div>
    </div>
    
    <!-- Action Buttons -->
    <div v-if="thread" class="flex items-center gap-1 md:gap-2">
      <button 
        @click="confirmClearThread"
        class="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        title="Clear conversation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  thread: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['clear', 'update-thread'])

const isEditing = ref(false)
const editedTitle = ref('')
const titleInput = ref(null)

// Start editing title
const startEditing = () => {
  editedTitle.value = props.thread?.title || ''
  isEditing.value = true
  nextTick(() => {
    if (titleInput.value) {
      titleInput.value.focus()
      titleInput.value.select()
    }
  })
}

// Cancel editing
const cancelEditing = () => {
  isEditing.value = false
  editedTitle.value = ''
}

// Update title
const updateTitle = () => {
  // Don't update if empty or unchanged
  if (!editedTitle.value.trim() || editedTitle.value.trim() === props.thread?.title) {
    cancelEditing()
    return
  }

  emit('update-thread', {
    id: props.thread.id,
    title: editedTitle.value.trim()
  })
  cancelEditing()
}

// Confirm clear thread
const confirmClearThread = () => {
  if (confirm('Are you sure you want to clear all messages in this conversation?')) {
    emit('clear')
  }
}
</script>

<style scoped>
/* Mobile optimizations */
@media (max-width: 768px) {
  input, button {
    touch-action: manipulation;
  }
}
</style> 
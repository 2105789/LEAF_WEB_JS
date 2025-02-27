<!-- Chat Header Component -->
<template>
  <div class="h-14 shrink-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
    <div class="flex-1">
      <div v-if="isEditing" class="flex items-center gap-2">
        <input 
          v-model="editedTitle" 
          @keyup.enter="updateTitle"
          @keyup.esc="cancelEditing"
          ref="titleInput"
          class="flex-1 max-w-96 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
          :placeholder="thread?.title"
        />
        <button 
          @click="updateTitle"
          class="text-green-600 hover:text-green-700"
        >
          ✓
        </button>
        <button 
          @click="cancelEditing"
          class="text-red-600 hover:text-red-700"
        >
          ✕
        </button>
      </div>
      <h2 v-else class="text-xl font-semibold text-gray-900 flex items-center gap-2">
        {{ thread ? thread.title : 'Select a thread to start chatting' }}
        <button 
          v-if="thread"
          @click="startEditing"
          class="text-gray-500 hover:text-gray-700 transition-colors"
          title="Edit title"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
      </h2>
    </div>
    <div v-if="thread" class="flex items-center gap-3">
      <button 
        @click="$emit('clear')"
        class="text-gray-500 hover:text-gray-700 transition-colors"
        title="Clear chat"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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

const startEditing = () => {
  editedTitle.value = props.thread.title
  isEditing.value = true
  nextTick(() => {
    if (titleInput.value) {
      titleInput.value.focus()
    }
  })
}

const cancelEditing = () => {
  isEditing.value = false
  editedTitle.value = ''
}

const updateTitle = () => {
  if (!editedTitle.value.trim()) {
    cancelEditing()
    return
  }

  emit('update-thread', {
    id: props.thread.id,
    title: editedTitle.value.trim()
  })
  cancelEditing()
}
</script> 
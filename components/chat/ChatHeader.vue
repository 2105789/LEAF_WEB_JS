<!-- Chat Header Component -->
<template>
  <div class="h-14 shrink-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
    <h2 class="text-xl font-semibold text-gray-900">
      {{ thread ? thread.title : 'Select a thread to start chatting' }}
    </h2>
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
defineProps({
  thread: {
    type: Object,
    default: null
  }
})

defineEmits(['clear'])
</script> 
<template>
  <!-- A full-screen overlay for the modal with backdrop blur -->
  <div class="fixed inset-0 flex items-center justify-center bg-gray-800/50 backdrop-blur-sm z-50">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 transform transition-all duration-300 animate-modal-fade-in">
      <h2 class="text-2xl font-bold text-center text-gray-800 mb-8">Complete Your Profile</h2>
      
      <div class="space-y-6">
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700">Position</label>
          <input
            type="text"
            v-model="position"
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
            placeholder="Your job title or role"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700">Organization</label>
          <input
            type="text"
            v-model="organization"
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
            placeholder="Your company or organization"
          />
        </div>

        <div class="flex items-center justify-end gap-4 mt-8">
          <button 
            @click="cancel" 
            class="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
          >
            Cancel
          </button>
          <button 
            @click="submitDetails"
            class="px-6 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
// Define the events the modal will emit
const emit = defineEmits(['submit', 'cancel'])
const position = ref('')
const organization = ref('')

const submitDetails = () => {
  // Emit the details to the parent component
  emit('submit', { position: position.value, organization: organization.value })
}
const cancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.animate-modal-fade-in {
  animation: modalFadeIn 0.3s ease-out;
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

<!-- Chat Input Component -->
<template>
  <div class="shrink-0 bg-white border-t border-gray-100 p-2 md:p-3">
    <!-- PDF Preview/Indicator -->
    <div v-if="attachedPdfs.length > 0" class="mb-2 flex items-center gap-2 rounded-md bg-gray-50 p-2 text-sm">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
      </svg>
      <span class="truncate flex-1">Using context from: {{ attachedPdfs[0].name }}</span>
      <button 
        @click="showPdfModal = true"
        class="text-gray-400 hover:text-teal-600 p-1 transition-colors shrink-0"
        title="View PDF details"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
        </svg>
      </button>
      <button 
        @click="clearPdf()"
        class="text-gray-400 hover:text-red-600 p-1 transition-colors shrink-0"
        title="Remove PDF"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <!-- Main Input Form -->
    <form @submit.prevent="handleSubmit" class="relative rounded-lg border border-gray-100 bg-white shadow-sm transition focus-within:border-teal-200 focus-within:ring-1 focus-within:ring-teal-200">
      <textarea
        v-model="message"
        @keydown.enter.exact.prevent="handleSubmit"
        @keydown.enter.shift.exact.prevent="message += '\n'"
        @input="autoGrow"
        placeholder="Type a message... (Shift+Enter for new line)"
        class="w-full resize-none rounded-lg border-0 bg-transparent px-2 md:px-3 py-3 pr-16 md:pr-24 focus:outline-none focus:ring-0 min-h-[44px] max-h-[200px] text-sm align-middle"
        :rows="1"
        :disabled="disabled || isLoading"
        ref="messageInput"
      ></textarea>
      
      <!-- Action buttons -->
      <div class="absolute right-1 bottom-1 top-1 flex items-center gap-1 bg-white pl-2">
        <!-- PDF Upload -->
        <input
          type="file"
          ref="fileInput"
          accept=".pdf"
          class="hidden"
          @change="handleFileUpload"
        />
        <button
          type="button"
          @click="$refs.fileInput.click()"
          :disabled="disabled || isLoading || attachedPdfs.length > 0"
          :class="[
            'p-1.5 rounded-full transition-colors',
            attachedPdfs.length > 0 
              ? 'text-teal-500 cursor-default' 
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50',
            'hidden sm:block' // Hide on mobile to save space
          ]"
          title="Upload PDF for context"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
            <path d="M8 11a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
          </svg>
        </button>

        <!-- Clear input -->
        <button
          v-if="message && !isLoading"
          type="button"
          @click="clearInput"
          class="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Clear message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- Send button -->
        <button
          type="submit"
          class="p-1.5 rounded-full transition-colors disabled:opacity-50"
          :class="isLoading || !message.trim() || disabled ? 'text-gray-300 cursor-not-allowed' : 'text-teal-600 hover:text-teal-700 hover:bg-teal-50'"
          :disabled="disabled || !message.trim() || isLoading"
          title="Send message"
        >
          <svg v-if="isLoading" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </form>

    <!-- Mobile PDF Upload Button (Fixed Position) -->
    <button
      v-if="!attachedPdfs.length"
      type="button"
      @click="$refs.fileInput?.click()"
      class="sm:hidden fixed bottom-20 right-4 z-10 bg-teal-500 text-white p-3 rounded-full shadow-lg"
      :disabled="disabled || isLoading"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
        <path d="M8 11a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
      </svg>
    </button>

    <!-- PDF Modal -->
    <div v-if="showPdfModal" class="fixed inset-0 z-50 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg max-w-lg w-full shadow-xl relative">
        <!-- Close button -->
        <button 
          @click="showPdfModal = false"
          class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        
        <!-- Modal content -->
        <div class="p-5">
          <div class="flex items-center gap-3 mb-5">
            <div class="bg-red-100 p-2 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900">PDF Context</h3>
          </div>
          
          <div class="space-y-4">
            <div v-for="(pdf, index) in attachedPdfs" :key="index" 
                 class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div class="flex items-center gap-3 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
                </svg>
                <div class="truncate">
                  <p class="font-medium text-gray-900 truncate">{{ pdf.name }}</p>
                  <p class="text-xs text-gray-500">{{ formatFileSize(pdf.size) }}</p>
                </div>
              </div>
              <button 
                @click="removePdf(index)"
                class="text-gray-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-full transition-colors shrink-0"
                title="Remove PDF"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
            
            <div v-if="attachedPdfs.length === 0" class="text-center py-6 text-gray-500">
              No PDFs attached
            </div>
            
            <p class="text-sm text-gray-600 mt-2">
              PDF context will be used to provide more relevant answers related to the document content.
            </p>
          </div>
          
          <div class="mt-6 flex justify-end">
            <button 
              type="button"
              @click="showPdfModal = false" 
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['submit', 'pdf-upload'])
const message = ref('')
const messageInput = ref(null)
const fileInput = ref(null)
const showPdfModal = ref(false)
const attachedPdfs = ref([])

// Format file size
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' bytes'
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  else return (bytes / 1048576).toFixed(1) + ' MB'
}

// Auto-resize textarea based on content
const autoGrow = () => {
  if (!messageInput.value) return
  
  // Reset height to allow proper calculation
  messageInput.value.style.height = 'auto'
  
  // Set to scrollHeight if content is higher than minimum height
  const newHeight = Math.max(44, Math.min(messageInput.value.scrollHeight, 200))
  messageInput.value.style.height = newHeight + 'px'
}

// Clear input text
const clearInput = () => {
  message.value = ''
  if (messageInput.value) {
    messageInput.value.style.height = 'auto'
  }
}

// Clear all PDFs
const clearPdf = () => {
  attachedPdfs.value = []
}

// Handle file upload with validation and optimized processing
const handleFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // Validate file type
  if (file.type !== 'application/pdf') {
    alert('Please upload a valid PDF file')
    event.target.value = ''
    return
  }
  
  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('PDF file size must be under 10MB')
    event.target.value = ''
    return
  }

  try {
    // Read file efficiently
    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    
    // Replace any existing PDFs (only one PDF at a time)
    attachedPdfs.value = [{
      name: file.name,
      size: file.size,
      data: base64
    }]
    
    // Show user feedback
    showPdfModal.value = true
  } catch (error) {
    console.error('Error processing PDF:', error)
    alert('Failed to upload PDF')
  }
  
  // Reset file input
  event.target.value = ''
}

// Remove specific PDF
const removePdf = (index) => {
  attachedPdfs.value.splice(index, 1)
}

// Submit message
const handleSubmit = () => {
  if (!message.value.trim() || props.isLoading || props.disabled) return
  
  // Get PDF data if available
  const pdfContext = attachedPdfs.value.length > 0 ? attachedPdfs.value[0].data : null
  
  emit('submit', {
    message: message.value.trim(),
    pdfContext,
    mode: 'general'
  })
  
  // Clear input but keep PDF context
  clearInput()
}

// Reset if thread changes
watch(() => props.disabled, (newValue) => {
  if (newValue) {
    clearPdf()
  }
})

// Focus input on component mount
onMounted(() => {
  if (messageInput.value && !props.disabled) {
    messageInput.value.focus()
  }
})
</script>

<style scoped>
/* Mobile optimizations */
@media (max-width: 768px) {
  textarea, button {
    touch-action: manipulation;
  }
  
  .max-h-\[200px\] {
    max-height: 120px; /* Smaller max height on mobile */
  }
}
</style> 
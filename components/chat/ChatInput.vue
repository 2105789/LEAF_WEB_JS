<!-- Chat Input Component -->
<template>
  <div class="shrink-0 bg-white border-t border-gray-100 p-4">
    <!-- PDF List Modal -->
    <div v-if="showPdfModal" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <!-- Background overlay -->
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="showPdfModal = false"></div>

        <!-- Modal panel -->
        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <!-- PDF Icon -->
              <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
                </svg>
              </div>
              
              <!-- Content -->
              <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                  Attached PDFs
                </h3>
                <div class="mt-4 space-y-3">
                  <div v-for="(pdf, index) in attachedPdfs" :key="index" 
                    class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex items-center space-x-3">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
                      </svg>
                      <div>
                        <p class="text-sm font-medium text-gray-900">{{ pdf.name }}</p>
                        <p class="text-xs text-gray-500">{{ (pdf.size / 1024).toFixed(1) }} KB</p>
                      </div>
                    </div>
                    <button 
                      @click="removePdf(index)"
                      class="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-full transition-colors"
                      title="Remove PDF"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  <div v-if="attachedPdfs.length === 0" class="text-center py-4 text-gray-500">
                    No PDFs attached
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Modal footer -->
          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button 
              type="button" 
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              @click="showPdfModal = false"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>

    <form @submit.prevent="handleSubmit" class="flex gap-2">
      <div class="flex-1 relative">
        <textarea
          v-model="message"
          @keydown.enter.exact.prevent="handleSubmit"
          @keydown.enter.shift.exact.prevent="message += '\n'"
          @input="autoGrow"
          placeholder="Type your message... (Shift + Enter for new line)"
          class="w-full resize-none rounded-lg border border-gray-100 p-3 pr-24 focus:outline-none focus:ring-2 focus:ring-teal-200 min-h-[44px] max-h-[200px]"
          :rows="1"
          :disabled="disabled || isLoading"
          ref="messageInput"
        ></textarea>
        
        <!-- Action buttons container -->
        <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
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
            class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-50"
            :class="{'text-green-500 hover:text-green-600': hasUploadedPdf}"
            title="Upload PDF for context"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
          </button>

          <!-- View PDFs button -->
          <button
            v-if="attachedPdfs.length > 0"
            type="button"
            @click="showPdfModal = true"
            class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-50"
            title="View attached PDFs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              <path fill-rule="evenodd" d="M8 10a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd" />
            </svg>
          </button>

          <!-- Clear input -->
          <button
            v-if="message && !isLoading"
            type="button"
            @click="clearInput"
            class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-50"
            title="Clear message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </button>

          <!-- Send button -->
          <button
            type="submit"
            class="text-teal-600 hover:text-teal-700 transition-colors p-1 rounded-full hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="disabled || !message.trim() || isLoading"
            title="Send message"
          >
            <svg v-if="isLoading" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

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
const hasUploadedPdf = ref(false)
const showPdfModal = ref(false)
const attachedPdfs = ref([])
const enableResearch = ref(false)
const showResearchTooltip = ref(false)

// Auto-grow textarea
const autoGrow = () => {
  if (!messageInput.value) return
  messageInput.value.style.height = 'auto'
  messageInput.value.style.height = messageInput.value.scrollHeight + 'px'
}

// Clear input
const clearInput = () => {
  message.value = ''
  if (messageInput.value) {
    messageInput.value.style.height = 'auto'
  }
}

// Handle file upload
const handleFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file || file.type !== 'application/pdf') {
    alert('Please upload a valid PDF file')
    return
  }

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    // Convert ArrayBuffer to base64
    const base64 = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    
    // Add to attached PDFs list
    attachedPdfs.value.push({
      name: file.name,
      size: file.size,
      data: base64
    })
    
    hasUploadedPdf.value = true
    showPdfModal.value = true // Show the modal when a file is uploaded
  } catch (error) {
    console.error('Error uploading PDF:', error)
    alert('Failed to upload PDF')
  }
  
  // Reset file input
  event.target.value = ''
}

// Handle form submit
const handleSubmit = (e) => {
  if (e) e.preventDefault()
  if (!message.value.trim() || props.isLoading) return
  
  // Get PDF data if available
  const pdfContext = attachedPdfs.value.length > 0 ? attachedPdfs.value[0].data : null
  
  emit('submit', {
    message: message.value.trim(),
    pdfContext,
    mode: enableResearch.value ? 'research' : 'general'
  })
  
  clearInput()
  // Don't clear PDFs after sending - they should persist in the thread
}

// Remove PDF from list
const removePdf = (index) => {
  attachedPdfs.value.splice(index, 1)
  if (attachedPdfs.value.length === 0) {
    hasUploadedPdf.value = false
  }
}

// Reset PDFs when thread changes
watch(() => props.disabled, (newValue) => {
  if (newValue) {
    hasUploadedPdf.value = false
    attachedPdfs.value = []
  }
})
</script> 
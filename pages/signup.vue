<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-indigo-50 p-4 sm:p-6">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 transform transition-all duration-300 hover:shadow-2xl mx-auto">
      <div class="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo" class="h-12 object-contain" />
      </div>
      
      <h1 class="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-6">Create Account</h1>
      
      <form @submit.prevent="handleEmailSignup" class="space-y-5">
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 block">Email</label>
          <input 
            v-model="email" 
            type="email" 
            class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
            placeholder="Enter your email"
            required
            :disabled="isProcessing"
          />
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 block">Password</label>
          <input 
            v-model="password" 
            type="password" 
            class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
            placeholder="Choose a strong password"
            required
            :disabled="isProcessing"
          />
        </div>

        <button 
          type="submit" 
          class="w-full bg-teal-600 text-white py-3 rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-teal-600"
          :disabled="isProcessing"
        >
          <span v-if="isProcessing" class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
          <span v-else>Continue with Email</span>
        </button>
      </form>

      <div class="relative my-6">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-200"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-4 bg-white text-gray-500">or continue with</span>
        </div>
      </div>

      <button 
        @click="handleGoogleSignup"
        class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
        :disabled="isProcessing"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" class="w-5 h-5" />
        <span v-if="isProcessing" class="text-gray-700 font-medium flex items-center gap-2">
          <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Connecting...
        </span>
        <span v-else class="text-gray-700 font-medium">Google</span>
      </button>

      <p class="mt-6 text-center text-gray-600">
        Already have an account?
        <nuxt-link to="/login" class="text-teal-600 font-medium hover:text-teal-700 transition-colors duration-200">
          Sign in
        </nuxt-link>
      </p>
    </div>
  </div>

  <!-- Additional Details Modal -->
  <AdditionalDetailsModal
    v-if="showModal"
    @submit="submitModalDetails"
    @cancel="cancelModal"
  />

  <Toast ref="toast" />
</template>

<script setup>
definePageMeta({
  middleware: 'guest'
})

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { signInWithPopup, GoogleAuthProvider, getAuth } from 'firebase/auth'
import { auth } from '~/utils/firebase.js'
import AdditionalDetailsModal from '~/components/AdditionalDetailsModal.vue'
import Toast from '~/components/Toast.vue'

const router = useRouter()
const { setToken, fetchUser } = useAuth()

// State for email signup fields
const email = ref('')
const password = ref('')
const toast = ref(null)
const isProcessing = ref(false)

// State for controlling the modal popup and storing pending signup data
const showModal = ref(false)
const pendingSignupData = ref(null)

/**
 * Email Signup Flow:
 * 1. The user fills in email and password.
 * 2. On submit, we store those values and display the modal.
 */
const handleEmailSignup = async () => {
  if (isProcessing.value) return
  
  try {
    isProcessing.value = true
    toast.value?.addToast('Processing signup...', 'info', 0)
    
    console.log('Starting email signup...')
    pendingSignupData.value = {
      method: 'email',
      email: email.value,
      password: password.value
    }
    showModal.value = true
  } catch (error) {
    console.error('Email signup error:', error)
    toast.value?.addToast(error?.data?.error || 'Email signup failed. Please try again.', 'error', 3000)
    isProcessing.value = false
  }
}

/**
 * Google Signup Flow:
 * 1. The user clicks the Google signup button.
 * 2. Firebase shows its own popup to handle authentication.
 * 3. When the sign in completes, we save the idToken and show the modal.
 */
const handleGoogleSignup = async () => {
  if (isProcessing.value) return
  
  try {
    isProcessing.value = true
    toast.value?.addToast('Connecting to Google...', 'info', 0)
    
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({
      prompt: 'select_account'
    })
    
    const auth = getAuth()
    const result = await signInWithPopup(auth, provider)
    
    toast.value?.addToast('Google authentication successful, processing signup...', 'info', 0)
    
    const idToken = await result.user.getIdToken()
    pendingSignupData.value = {
      method: 'google',
      idToken
    }
    showModal.value = true
  } catch (error) {
    console.error('Google signup error:', error)
    if (error.code === 'auth/popup-closed-by-user') {
      toast.value?.addToast('Signup popup was closed. Please try again.', 'error', 3000)
    } else if (error.code === 'auth/popup-blocked') {
      toast.value?.addToast('Popup was blocked by the browser. Please enable popups for this site.', 'error', 3000)
    } else {
      toast.value?.addToast('Google signup failed: ' + error.message, 'error', 3000)
    }
    isProcessing.value = false
  }
}

/**
 * Once the modal is submitted, combine the additional details with the pending
 * signup data and call the appropriate API endpoint.
 */
const submitModalDetails = async (details) => {
  try {
    console.log('Submitting additional details...')
    showModal.value = false
    
    if (pendingSignupData.value.method === 'email') {
      console.log('Calling signup endpoint...')
      const data = await $fetch('/api/auth/signup', {
        method: 'POST',
        body: {
          email: pendingSignupData.value.email,
          password: pendingSignupData.value.password,
          position: details.position,
          organization: details.organization,
        },
        credentials: 'include'
      })
      console.log('Signup response:', data)
      
      if (data.success) {
        console.log('Fetching user data...')
        const userData = await fetchUser()
        if (userData) {
          toast.value?.addToast('Signup successful! Redirecting...', 'success', 2000)
          // Wait for toast to be visible before redirecting
          await new Promise(resolve => setTimeout(resolve, 500))
          console.log('User data fetched, redirecting to profile...')
          router.push('/chat')
        } else {
          toast.value?.addToast('Failed to fetch user data. Please try again.', 'error', 3000)
        }
      }
    } else if (pendingSignupData.value.method === 'google') {
      console.log('Calling google-login endpoint with additional details...')
      const data = await $fetch('/api/auth/google-login', {
        method: 'POST',
        body: {
          idToken: pendingSignupData.value.idToken,
          position: details.position,
          organization: details.organization,
        },
        credentials: 'include'
      })
      console.log('Login response:', data)
      
      if (data.success) {
        console.log('Fetching user data...')
        const userData = await fetchUser()
        if (userData) {
          toast.value?.addToast('Signup successful! Redirecting...', 'success', 2000)
          // Wait for toast to be visible before redirecting
          await new Promise(resolve => setTimeout(resolve, 500))
          console.log('User data fetched, redirecting to profile...')
          router.push('/chat')
        } else {
          toast.value?.addToast('Failed to fetch user data. Please try again.', 'error', 3000)
        }
      }
    }
  } catch (error) {
    console.error('Signup error:', error)
    toast.value?.addToast(error?.data?.error || 'Signup failed. Please try again.', 'error', 3000)
  } finally {
    isProcessing.value = false
  }
}

/**
 * If the user cancels the modal, clear the pending signup data.
 */
const cancelModal = () => {
  showModal.value = false
  pendingSignupData.value = null
  isProcessing.value = false
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-indigo-50 p-6">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 transform transition-all duration-300 hover:shadow-2xl">
      <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Welcome Back</h1>
      
      <form @submit.prevent="handleLogin" class="space-y-6">
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700">Email</label>
          <input 
            v-model="email" 
            type="email" 
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
            placeholder="Enter your email"
            required
            :disabled="isProcessing"
          />
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700">Password</label>
          <input 
            v-model="password" 
            type="password" 
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
            placeholder="Enter your password"
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
          <span v-else>Sign In</span>
        </button>
      </form>

      <div class="relative my-8">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-200"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-4 bg-white text-gray-500">or continue with</span>
        </div>
      </div>

      <button 
        @click="handleGoogleLogin"
        class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
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

      <p class="mt-8 text-center text-gray-600">
        Don't have an account?
        <nuxt-link to="/signup" class="text-teal-600 font-medium hover:text-teal-700 transition-colors duration-200">
          Create account
        </nuxt-link>
      </p>
    </div>
  </div>

  <!-- Modal for additional details (only shown when needed) -->
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
import { useCookie } from '#app'

const router = useRouter()
const { setToken, fetchUser } = useAuth()

const email = ref('')
const password = ref('')
const toast = ref(null)
const isProcessing = ref(false)

// State to control the additional details modal for Google login
const showModal = ref(false)
// pendingGoogleData will hold { method: 'google', idToken } from the Google popup
const pendingGoogleData = ref(null)

const handleLogin = async () => {
  if (isProcessing.value) return
  
  try {
    isProcessing.value = true
    toast.value?.addToast('Logging in...', 'info', 0) // Duration 0 means it won't auto-dismiss
    
    console.log('Starting email/password login...')
    const data = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
      credentials: 'include'
    })
    console.log('Login response:', data)
    
    if (data.success) {
      console.log('Fetching user data...')
      const userData = await fetchUser()
      if (userData) {
        toast.value?.addToast('Login successful! Redirecting...', 'success', 2000)
        // Wait for toast to be visible before redirecting
        await new Promise(resolve => setTimeout(resolve, 500))
        console.log('User data fetched, redirecting to profile...')
        router.push('/chat')
      } else {
        toast.value?.addToast('Failed to fetch user data. Please try again.', 'error', 3000)
      }
    }
  } catch (error) {
    console.error('Login error details:', error)
    toast.value?.addToast(error?.data?.error || 'Login failed. Please try again.', 'error', 3000)
  } finally {
    isProcessing.value = false
  }
}

const handleGoogleLogin = async () => {
  if (isProcessing.value) return
  
  try {
    isProcessing.value = true
    toast.value?.addToast('Connecting to Google...', 'info', 0)
    
    console.log('Starting Google login flow...')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({
      prompt: 'select_account'
    })
    
    console.log('Getting auth instance...')
    const auth = getAuth()
    console.log('Opening Google popup...')
    const result = await signInWithPopup(auth, provider)
    
    toast.value?.addToast('Google authentication successful, logging in...', 'info', 0)
    
    console.log('Google auth successful, getting ID token...')
    const idToken = await result.user.getIdToken()
    console.log('Got ID token, calling backend...')

    const response = await $fetch('/api/auth/google-login', {
      method: 'POST',
      body: { idToken },
      credentials: 'include'
    })
    console.log('Backend response:', response)

    if (response.needsDetails) {
      console.log('User needs to provide additional details...')
      pendingGoogleData.value = { method: 'google', idToken }
      showModal.value = true
      toast.value?.addToast('Please provide additional details', 'info', 3000)
    } else if (response.success) {
      console.log('Login successful, fetching user data...')
      const userData = await fetchUser()
      if (userData) {
        toast.value?.addToast('Login successful! Redirecting...', 'success', 2000)
        // Wait for toast to be visible before redirecting
        await new Promise(resolve => setTimeout(resolve, 500))
        console.log('User data fetched, redirecting to profile...')
        router.push('/chat')
      } else {
        toast.value?.addToast('Failed to fetch user data. Please try again.', 'error', 3000)
      }
    }
  } catch (error) {
    console.error('Google login error details:', error)
    if (error.code === 'auth/popup-closed-by-user') {
      toast.value?.addToast('Login popup was closed. Please try again.', 'error', 3000)
    } else if (error.code === 'auth/popup-blocked') {
      toast.value?.addToast('Popup was blocked by the browser. Please enable popups for this site.', 'error', 3000)
    } else {
      toast.value?.addToast(error?.data?.error || 'Google login failed. Please try again.', 'error', 3000)
    }
  } finally {
    isProcessing.value = false
  }
}

const submitModalDetails = async (details) => {
  console.log('Submitting additional details...')
  showModal.value = false
  if (pendingGoogleData.value && pendingGoogleData.value.method === 'google') {
    try {
      console.log('Calling google-login endpoint with additional details...')
      const data = await $fetch('/api/auth/google-login', {
        method: 'POST',
        body: {
          idToken: pendingGoogleData.value.idToken,
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
          toast.value?.addToast('Login successful! Redirecting...', 'success', 2000)
          // Wait for toast to be visible before redirecting
          await new Promise(resolve => setTimeout(resolve, 500))
          console.log('User data fetched, redirecting to profile...')
          router.push('/chat')
        } else {
          toast.value?.addToast('Failed to fetch user data. Please try again.', 'error', 3000)
        }
      }
    } catch (error) {
      console.error('Google login with details error:', error)
      toast.value?.addToast(error?.data?.error || 'Login failed. Please try again.', 'error', 3000)
    }
  }
}

const cancelModal = () => {
  showModal.value = false
  pendingGoogleData.value = null
}
</script>

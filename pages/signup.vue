<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 transform transition-all duration-300 hover:shadow-2xl">
      <h1 class="text-3xl font-bold text-center text-gray-800 mb-8">Create Account</h1>
      
      <form @submit.prevent="handleEmailSignup" class="space-y-6">
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700">Email</label>
          <input 
            v-model="email" 
            type="email" 
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            placeholder="Enter your email"
            required 
          />
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700">Password</label>
          <input 
            v-model="password" 
            type="password" 
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            placeholder="Choose a strong password"
            required 
          />
        </div>

        <button 
          type="submit" 
          class="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02]"
        >
          Continue with Email
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
        @click="handleGoogleSignup"
        class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" class="w-5 h-5" />
        <span class="text-gray-700 font-medium">Google</span>
      </button>

      <p class="mt-8 text-center text-gray-600">
        Already have an account?
        <nuxt-link to="/login" class="text-blue-600 font-medium hover:text-blue-700 transition-colors duration-200">
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

const router = useRouter()
const { setToken, fetchUser } = useAuth()

// State for email signup fields
const email = ref('')
const password = ref('')

// State for controlling the modal popup and storing pending signup data
const showModal = ref(false)
const pendingSignupData = ref(null)

/**
 * Email Signup Flow:
 * 1. The user fills in email and password.
 * 2. On submit, we store those values and display the modal.
 */
const handleEmailSignup = async () => {
  try {
    console.log('Starting email signup...')
    pendingSignupData.value = {
      method: 'email',
      email: email.value,
      password: password.value
    }
    showModal.value = true
  } catch (error) {
    console.error('Email signup error:', error)
    alert(error?.data?.error || 'Email signup failed')
  }
}

/**
 * Google Signup Flow:
 * 1. The user clicks the Google signup button.
 * 2. Firebase shows its own popup to handle authentication.
 * 3. When the sign in completes, we save the idToken and show the modal.
 */
const handleGoogleSignup = async () => {
  try {
    const provider = new GoogleAuthProvider()
    // Add login hint and prompt for better UX
    provider.setCustomParameters({
      prompt: 'select_account'
    })
    
    // Get the auth instance and sign in
    const auth = getAuth()
    const result = await signInWithPopup(auth, provider)
    const idToken = await result.user.getIdToken()
    
    pendingSignupData.value = {
      method: 'google',
      idToken
    }
    showModal.value = true
  } catch (error) {
    console.error('Google signup error:', error)
    if (error.code === 'auth/popup-closed-by-user') {
      alert('Signup popup was closed. Please try again.')
    } else if (error.code === 'auth/popup-blocked') {
      alert('Popup was blocked by the browser. Please enable popups for this site.')
    } else {
      alert('Google signup failed: ' + error.message)
    }
  }
}

/**
 * Once the modal is submitted, combine the additional details with the pending
 * signup data and call the appropriate API endpoint.
 */
const submitModalDetails = async (details) => {
  console.log('Submitting additional details...')
  showModal.value = false
  if (pendingSignupData.value.method === 'email') {
    try {
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
          console.log('User data fetched, redirecting to profile...')
          router.push('/chat')
        } else {
          alert('Failed to fetch user data')
        }
      }
    } catch (error) {
      console.error('Email signup error:', error)
      alert(error?.data?.error || 'Email signup failed')
    }
  } else if (pendingSignupData.value.method === 'google') {
    try {
      console.log('Calling google-signup endpoint...')
      const data = await $fetch('/api/auth/google-signup', {
        method: 'POST',
        body: {
          idToken: pendingSignupData.value.idToken,
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
          console.log('User data fetched, redirecting to profile...')
          router.push('/chat')
        } else {
          alert('Failed to fetch user data')
        }
      }
    } catch (error) {
      console.error('Google signup error:', error)
      alert(error?.data?.error || 'Google signup failed')
    }
  }
}

/**
 * If the user cancels the modal, clear the pending signup data.
 */
const cancelModal = () => {
  showModal.value = false
  pendingSignupData.value = null
}
</script>

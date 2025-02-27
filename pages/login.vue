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
          />
        </div>

        <button 
          type="submit" 
          class="w-full bg-teal-600 text-white py-3 rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02]"
        >
          Sign In
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
        class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" class="w-5 h-5" />
        <span class="text-gray-700 font-medium">Google</span>
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
import { useCookie } from '#app'

const router = useRouter()
const { setToken, fetchUser } = useAuth()

const email = ref('')
const password = ref('')

// State to control the additional details modal for Google login
const showModal = ref(false)
// pendingGoogleData will hold { method: 'google', idToken } from the Google popup
const pendingGoogleData = ref(null)

const handleLogin = async () => {
  try {
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
        console.log('User data fetched, redirecting to profile...')
        router.push('/chat')
      } else {
        alert('Failed to fetch user data')
      }
    }
  } catch (error) {
    console.error('Login error details:', error)
    alert(error?.data?.error || 'Login failed')
  }
}

const handleGoogleLogin = async () => {
  try {
    console.log('Starting Google login flow...')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({
      prompt: 'select_account'
    })
    
    console.log('Getting auth instance...')
    const auth = getAuth()
    console.log('Opening Google popup...')
    const result = await signInWithPopup(auth, provider)
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
    } else if (response.success) {
      console.log('Login successful, fetching user data...')
      const userData = await fetchUser()
      if (userData) {
        console.log('User data fetched, redirecting to profile...')
        router.push('/chat')
      } else {
        alert('Failed to fetch user data')
      }
    }
  } catch (error) {
    console.error('Google login error details:', error)
    if (error.code === 'auth/popup-closed-by-user') {
      alert('Login popup was closed. Please try again.')
    } else if (error.code === 'auth/popup-blocked') {
      alert('Popup was blocked by the browser. Please enable popups for this site.')
    } else {
      alert(error?.data?.error || 'Google login failed')
    }
  }
}

const submitModalDetails = async (details) => {
  console.log('Submitting additional details...')
  showModal.value = false
  if (pendingGoogleData.value && pendingGoogleData.value.method === 'google') {
    try {
      console.log('Calling google-signup endpoint...')
      const data = await $fetch('/api/auth/google-signup', {
        method: 'POST',
        body: {
          idToken: pendingGoogleData.value.idToken,
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
      console.error('Google signup error details:', error)
      alert(error?.data?.error || 'Google signup failed')
    }
  }
}

const cancelModal = () => {
  showModal.value = false
  pendingGoogleData.value = null
}
</script>

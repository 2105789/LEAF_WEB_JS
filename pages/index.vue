<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-indigo-50 p-6">
    <div class="w-full max-w-2xl text-center">
      <h1 class="text-5xl font-bold text-gray-800 mb-6 animate-fade-in">
        Welcome to <span class="text-teal-600">LEAF</span>
      </h1>
      <p class="text-xl text-gray-600 mb-12 animate-fade-in-delay">
        Your platform for seamless collaboration and innovation
      </p>
      
      <!-- Show different content based on auth state -->
      <div v-if="user" class="space-y-8 animate-fade-in-delay-2">
        <div class="bg-white rounded-2xl shadow-xl p-8">
          <p class="text-2xl font-medium text-gray-800 mb-6">
            Welcome back, <span class="text-teal-600">{{ user.email }}</span>!
          </p>
          <div class="flex items-center justify-center gap-6">
            <nuxt-link 
              to="/chat" 
              class="px-6 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02]"
            >
              Go to Profile
            </nuxt-link>
            <button 
              @click="handleLogout" 
              class="px-6 py-3 border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transform transition-all duration-200"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      <div v-else class="space-y-8 animate-fade-in-delay-2">
        <p class="text-xl text-gray-600">Join our community today</p>
        <div class="flex items-center justify-center gap-6">
          <nuxt-link 
            to="/login" 
            class="px-8 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02]"
          >
            Sign In
          </nuxt-link>
          <nuxt-link 
            to="/signup" 
            class="px-8 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transform transition-all duration-200"
          >
            Create Account
          </nuxt-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: 'public'
})

import { useAuth } from '~/composables/useAuth'

const { user, clearAuth } = useAuth()

const handleLogout = async () => {
  await clearAuth()
}
</script>

<style>
.animate-fade-in {
  animation: fadeIn 0.8s ease-out;
}

.animate-fade-in-delay {
  animation: fadeIn 0.8s ease-out 0.2s both;
}

.animate-fade-in-delay-2 {
  animation: fadeIn 0.8s ease-out 0.4s both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
  
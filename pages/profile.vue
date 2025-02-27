<template>
  <div class="min-h-screen bg-gray-50">
    <div class="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div class="bg-white shadow rounded-lg p-6">
        <div class="border-b border-gray-200 pb-4 mb-6">
          <div class="flex items-center justify-between">
            <h1 class="text-2xl font-semibold text-gray-900">Profile</h1>
            <button 
              @click="router.push('/chat')" 
              class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
              </svg>
              Back to Chat
            </button>
          </div>
        </div>
        <div v-if="user" class="space-y-4">
          <div class="flex items-center py-2">
            <span class="text-gray-500 w-32">Email:</span>
            <span class="text-gray-900">{{ user.email }}</span>
          </div>
          <div class="flex items-center py-2">
            <span class="text-gray-500 w-32">Position:</span>
            <span class="text-gray-900">{{ user.position }}</span>
          </div>
          <div class="flex items-center py-2">
            <span class="text-gray-500 w-32">Organization:</span>
            <span class="text-gray-900">{{ user.organization }}</span>
          </div>
          <div class="flex items-center py-2">
            <span class="text-gray-500 w-32">Role:</span>
            <span class="text-gray-900">{{ user.role }}</span>
          </div>
        </div>
        <div class="mt-8 pt-6 border-t border-gray-200">
          <button 
            @click="handleLogout" 
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: 'auth'
})

import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'

const { user, clearAuth, fetchUser } = useAuth()
const router = useRouter()

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    router.push('/login')
  }
})

const handleLogout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  clearAuth()
  router.push('/login')
}
</script>
  
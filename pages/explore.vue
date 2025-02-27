<template>
    <div class="min-h-screen flex flex-col items-center justify-center">
    <h1 class="text-2xl font-bold mb-4">Explore</h1>
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
  
  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }
  </script>
  
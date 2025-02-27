import { ref, watch } from 'vue'
import { useCookie, useRouter } from '#app'

export const useAuth = () => {
  const router = useRouter()
  const user = ref(null)
  
  // Use consistent cookie settings
  const token = useCookie('auth_token', {
    maxAge: 60 * 60 * 24 * 30 * 12,
    sameSite: 'lax',
    path: '/',
    watch: true
  })
  
  // Watch for token changes
  watch(token, (newToken) => {
    if (!newToken) {
      user.value = null
      router.push('/login')
    }
  })
  
  const fetchUser = async () => {
    try {
      const response = await $fetch('/api/auth/me', {
        credentials: 'include'
      })
      
      if (response.user) {
        user.value = response.user
        return user.value
      } else {
        user.value = null
        return null
      }
    } catch (error) {
      if (error.response?.status === 401) {
        clearAuth()
      }
      return null
    }
  }
  
  const clearAuth = () => {
    token.value = null
    user.value = null
    router.push('/login')
  }
  
  return {
    user,
    token,
    fetchUser,
    clearAuth
  }
}

import { defineNuxtRouteMiddleware, navigateTo, useCookie } from '#app'

export default defineNuxtRouteMiddleware((to, from) => {
  const authToken = useCookie('auth_token', {
    maxAge: 60 * 60 * 24 * 30 * 12,
    sameSite: 'lax',
    path: '/',
    watch: true
  })
  
  if (!authToken.value) {
    return navigateTo('/login')
  }
})

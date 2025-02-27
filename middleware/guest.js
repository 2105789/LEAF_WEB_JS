import { defineNuxtRouteMiddleware, navigateTo, useCookie } from '#app'

export default defineNuxtRouteMiddleware((to, from) => {
  console.log('Guest middleware: Checking authentication')
  const authToken = useCookie('auth_token', {
    maxAge: 60 * 60 * 24 * 30 * 12,
    sameSite: 'lax',
    path: '/',
    watch: true
  })
  
  console.log('Guest middleware: Token exists:', !!authToken.value)
  
  // If user is authenticated and trying to access guest-only pages (login/signup)
  if (authToken.value && (to.path === '/login' || to.path === '/signup')) {
    console.log('Guest middleware: Authenticated user redirected to profile')
    return navigateTo('/chat')
  }
  
  console.log('Guest middleware: Access allowed')
})

import { defineNuxtRouteMiddleware } from '#app'

export default defineNuxtRouteMiddleware((to, from) => {
  // Public pages are accessible to everyone
  console.log('Public middleware: Page is accessible to everyone')
}) 
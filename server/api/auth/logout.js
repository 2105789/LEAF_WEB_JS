import { setCookie } from 'h3'

export default defineEventHandler(async (event) => {
  // Clear the auth cookie by setting it to expire immediately
  setCookie(event, 'auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/'
  })
  
  return { success: true }
}) 
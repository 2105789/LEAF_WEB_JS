import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { setCookie, setResponseHeaders } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // Set CORS headers
  setResponseHeaders(event, {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
      ? 'https://leafo.vercel.app' 
      : 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })

  // Handle OPTIONS request for CORS preflight
  if (event.req.method === 'OPTIONS') {
    return 'OK'
  }

  if (event.req.method !== 'POST') {
    event.res.statusCode = 405
    return { error: 'Method not allowed' }
  }
  
  try {
    const body = await readBody(event)
    const { email, password } = body
    
    if (!email || !password) {
      event.res.statusCode = 400
      return { error: 'Email and password are required' }
    }
    
    // Find the user by email
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.password) {
      event.res.statusCode = 400
      return { error: 'Invalid credentials' }
    }
    
    // Verify the password
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      event.res.statusCode = 400
      return { error: 'Invalid credentials' }
    }
    
    // Generate a JWT token
    const config = useRuntimeConfig()
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    )
    
    // Set the token as a cookie with consistent settings
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 60 * 60 * 24 * 30 * 12, // 1 year
      path: '/'
    })
    
    return { success: true }
  } catch (error) {
    console.error('Login error:', error)
    event.res.statusCode = 500
    return { error: 'Internal server error during login' }
  }
})

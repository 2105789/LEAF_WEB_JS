import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { setCookie } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'POST') {
    event.res.statusCode = 405
    return { error: 'Method not allowed' }
  }
  
  const body = await readBody(event)
  const { email, password, position, organization } = body
  
  try {
    // Validate required fields
    if (!email || !password) {
      event.res.statusCode = 400
      return { error: 'Email and password are required' }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      event.res.statusCode = 400
      return { error: 'Invalid email format' }
    }

    // Validate password strength
    if (password.length < 6) {
      event.res.statusCode = 400
      return { error: 'Password must be at least 6 characters long' }
    }
    
    // Check if the user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      event.res.statusCode = 400
      return { error: 'User already exists' }
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10)
    
    // Create the user record with default role "normal"
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        position: position || null,
        organization: organization || null,
        role: 'normal'
      }
    })
    
    // Generate a JWT token
    const config = useRuntimeConfig()
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    )
    
    // Set the token as a cookie
    setCookie(event, 'auth_token', token, {
      httpOnly: false, // Allow JavaScript access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 * 12,
      path: '/'
    })
    
    return { success: true }
  } catch (error) {
    console.error('Signup error:', error)
    event.res.statusCode = 500
    return { error: 'Internal server error during signup' }
  }
})

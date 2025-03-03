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
      { expiresIn: '365d' }
    )
    
    // Set the token as a cookie with consistent settings
    setCookie(event, 'auth_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 * 12,
      path: '/'
    })
    
    return { success: true }
  } catch (error) {
    event.res.statusCode = 500
    return { error: 'Internal server error during login' }
  }
})

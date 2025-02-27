import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { getCookie } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // Get token from cookie instead of Authorization header
  const token = getCookie(event, 'auth_token')
  if (!token) {
    event.res.statusCode = 401
    return { error: 'Unauthorized' }
  }
  
  const config = useRuntimeConfig()
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    const user = await prisma.user.findUnique({ 
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        position: true,
        organization: true,
        role: true,
        googleId: true,
        createdAt: true,
        updatedAt: true
      }
    })
    
    if (!user) {
      event.res.statusCode = 404
      return { error: 'User not found' }
    }
    
    return { user }
  } catch (error) {
    console.error('Token verification error:', error)
    event.res.statusCode = 401
    return { error: 'Invalid token' }
  }
})

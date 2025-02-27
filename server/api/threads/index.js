import { PrismaClient } from '@prisma/client'
import { getCookie } from 'h3'
import jwt from 'jsonwebtoken'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // Verify authentication
  const token = getCookie(event, 'auth_token')
  if (!token) {
    event.res.statusCode = 401
    return { error: 'Unauthorized' }
  }

  const config = useRuntimeConfig()
  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    
    if (event.req.method === 'GET') {
      // Get all threads for the user
      const threads = await prisma.thread.findMany({
        where: { userId: decoded.id },
        orderBy: { createdAt: 'desc' }
      })
      return { threads }
    } 
    else if (event.req.method === 'POST') {
      // Create a new thread
      const body = await readBody(event)
      const { title } = body

      if (!title) {
        event.res.statusCode = 400
        return { error: 'Title is required' }
      }

      const thread = await prisma.thread.create({
        data: {
          title,
          userId: decoded.id
        }
      })
      return { thread }
    }
    
    event.res.statusCode = 405
    return { error: 'Method not allowed' }
  } catch (error) {
    console.error('Thread API error:', error)
    event.res.statusCode = 401
    return { error: 'Invalid token' }
  }
}) 
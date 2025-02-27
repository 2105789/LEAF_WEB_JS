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
    const threadId = parseInt(event.context.params.threadId)

    // Verify thread ownership
    const thread = await prisma.thread.findFirst({
      where: {
        id: threadId,
        userId: decoded.id
      }
    })

    if (!thread) {
      event.res.statusCode = 404
      return { error: 'Thread not found' }
    }

    if (event.req.method === 'GET') {
      // Get all messages for the thread
      const messages = await prisma.message.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' }
      })
      return { messages }
    } 
    else if (event.req.method === 'POST') {
      // Create a new message
      const body = await readBody(event)
      const { content, role } = body

      if (!content) {
        event.res.statusCode = 400
        return { error: 'Content is required' }
      }

      const message = await prisma.message.create({
        data: {
          content,
          role: role || 'user',
          threadId,
          userId: decoded.id
        }
      })
      return { message }
    }
    
    event.res.statusCode = 405
    return { error: 'Method not allowed' }
  } catch (error) {
    console.error('Messages API error:', error)
    event.res.statusCode = 401
    return { error: 'Invalid token' }
  }
}) 
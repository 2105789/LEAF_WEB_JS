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

    if (event.req.method === 'PUT') {
      const body = await readBody(event)
      const { title } = body

      if (!title) {
        event.res.statusCode = 400
        return { error: 'Title is required' }
      }

      const updatedThread = await prisma.thread.update({
        where: { id: threadId },
        data: { title }
      })

      return { thread: updatedThread }
    }

    event.res.statusCode = 405
    return { error: 'Method not allowed' }
  } catch (error) {
    console.error('Thread API error:', error)
    event.res.statusCode = 500
    return { error: 'Error updating thread' }
  }
}) 
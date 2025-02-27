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

    // Delete all messages in the thread first (due to foreign key constraints)
    await prisma.message.deleteMany({
      where: { threadId }
    })

    // Delete the thread
    await prisma.thread.delete({
      where: { id: threadId }
    })

    return { success: true }
  } catch (error) {
    console.error('Thread delete error:', error)
    event.res.statusCode = 500
    return { error: 'Error deleting thread' }
  }
}) 
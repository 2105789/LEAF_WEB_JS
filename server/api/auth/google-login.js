// server/api/auth/google-login.js
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import admin from 'firebase-admin'
import { setCookie, setResponseHeaders } from 'h3'

const prisma = new PrismaClient()

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const config = useRuntimeConfig()
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebaseAdmin.projectId,
      clientEmail: config.firebaseAdmin.clientEmail,
      privateKey: config.firebaseAdmin.privateKey.replace(/\\n/g, '\n'),
    }),
  })
}

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

  const body = await readBody(event)
  const { idToken } = body

  if (!idToken) {
    event.res.statusCode = 400
    return { error: 'idToken is required' }
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken)
    const { uid, email } = decodedToken

    // Look for an existing user (by googleId or email)
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: uid }, { email }],
      },
    })

    if (!user) {
      // User not found, signal that additional details are required.
      return { needsDetails: true }
    }

    const config = useRuntimeConfig()
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    )

    // Set the token as a cookie with specific options
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: true, // Always use secure in production
      sameSite: 'none', // Required for cross-origin requests
      maxAge: 60 * 60 * 24 * 30 * 12, // 1 year
      path: '/'
    })

    return { success: true }
  } catch (error) {
    console.error('Google login error:', error)
    event.res.statusCode = 400
    return { error: 'Invalid Google token' }
  }
})

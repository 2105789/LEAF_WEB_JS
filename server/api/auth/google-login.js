// server/api/auth/google-login.js
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import admin from 'firebase-admin'
import { setCookie } from 'h3'

const prisma = new PrismaClient()

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const config = useRuntimeConfig()
  
  // Validate required Firebase Admin configuration
  if (!config.firebaseAdmin?.projectId || !config.firebaseAdmin?.clientEmail || !config.firebaseAdmin?.privateKey) {
    console.error('Missing Firebase Admin configuration:', {
      hasProjectId: !!config.firebaseAdmin?.projectId,
      hasClientEmail: !!config.firebaseAdmin?.clientEmail,
      hasPrivateKey: !!config.firebaseAdmin?.privateKey
    })
    throw new Error('Firebase Admin configuration is incomplete')
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebaseAdmin.projectId,
        clientEmail: config.firebaseAdmin.clientEmail,
        privateKey: config.firebaseAdmin.privateKey.replace(/\\n/g, '\n'),
      }),
    })
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error)
    throw error
  }
}

export default defineEventHandler(async (event) => {
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
      httpOnly: false, // Allow JavaScript access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 * 12,
      path: '/'
    })

    return { success: true }
  } catch (error) {
    console.error('Google login error:', error)
    event.res.statusCode = 400
    return { error: 'Invalid Google token' }
  }
})

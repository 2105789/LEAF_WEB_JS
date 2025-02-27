// server/api/auth/google-signup.js
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import admin from 'firebase-admin'
import { setCookie } from 'h3'

const prisma = new PrismaClient()

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
  if (event.req.method !== 'POST') {
    event.res.statusCode = 405
    return { error: 'Method not allowed' }
  }

  const body = await readBody(event)
  const { idToken, position, organization } = body

  if (!idToken) {
    event.res.statusCode = 400
    return { error: 'idToken is required' }
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken)
    const { uid, email } = decodedToken

    // Check if user already exists (should not in signup flow)
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: uid }, { email }],
      },
    })

    if (user) {
      // If user exists, simply return token (user has already signed up)
      const config = useRuntimeConfig()
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        config.jwtSecret,
        { expiresIn: '1h' }
      )

      // Set the token as an HTTP-only cookie
      setCookie(event, 'auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30 * 12,
        path: '/'
      })

      return { success: true }
    }

    // Create a new user with default role 'normal'
    user = await prisma.user.create({
      data: {
        email,
        googleId: uid,
        position,
        organization,
        role: 'normal',
      },
    })

    const config = useRuntimeConfig()
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    )

    // Set the token as an HTTP-only cookie
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30 * 12,
      path: '/'
    })

    return { success: true }
  } catch (error) {
    console.error('Google signup error:', error)
    event.res.statusCode = 400
    return { error: 'Invalid Google token' }
  }
})

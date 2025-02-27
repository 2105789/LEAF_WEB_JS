// server/api/auth/google-login.js
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import admin from 'firebase-admin'
import { setCookie } from 'h3'

const prisma = new PrismaClient()

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const config = useRuntimeConfig()
  
  // Handle the private key format
  let privateKey = config.firebaseAdmin.privateKey
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n')
  }
  
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebaseAdmin.projectId,
      clientEmail: config.firebaseAdmin.clientEmail,
      privateKey: privateKey,
    }),
  })
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
    console.log('Attempting to verify token...');
    const decodedToken = await admin.auth().verifyIdToken(idToken)
    console.log('Token verified successfully:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      issuer: decodedToken.iss,
      audience: decodedToken.aud
    });

    const { uid, email } = decodedToken

    // Look for an existing user (by googleId or email)
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: uid }, { email }],
      },
    })

    if (!user) {
      console.log('No existing user found for:', { uid, email });
      // User not found, signal that additional details are required.
      return { needsDetails: true }
    }

    console.log('Existing user found:', { userId: user.id, userEmail: user.email });

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
    // Log the token for debugging (only first few characters for security)
    const truncatedToken = idToken ? `${idToken.substring(0, 10)}...` : 'no token';
    console.error('Google login error details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
      truncatedToken,
      firebaseConfig: {
        projectId: useRuntimeConfig().firebaseAdmin.projectId,
        clientEmail: useRuntimeConfig().firebaseAdmin.clientEmail,
        hasPrivateKey: !!useRuntimeConfig().firebaseAdmin.privateKey,
        privateKeyLength: useRuntimeConfig().firebaseAdmin.privateKey?.length,
      }
    })
    
    // Check for specific Firebase Auth errors
    if (error.code === 'auth/invalid-credential') {
      event.res.statusCode = 400
      return { error: 'Firebase credentials are invalid. Please check your configuration.' }
    } else if (error.code === 'auth/id-token-expired') {
      event.res.statusCode = 400
      return { error: 'The provided token has expired. Please try logging in again.' }
    } else if (error.code === 'auth/argument-error') {
      event.res.statusCode = 400
      return { error: 'Invalid token format. Please try logging in again.' }
    }
    
    event.res.statusCode = 400
    return { error: 'Invalid Google token: ' + error.message }
  }
})

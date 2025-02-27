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

  // Set a test cookie
  setCookie(event, 'test_cookie', 'test_value', {
    httpOnly: true,
    secure: true,
    sameSite: 'none', // Important for cross-origin requests
    path: '/',
  })

  return {
    status: 'success',
    message: 'Test API is working',
    timestamp: new Date().toISOString()
  }
}) 
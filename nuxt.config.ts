// https://nuxt.com/docs/api/configuration/nuxt-config
export default {
  runtimeConfig: {
    jwtSecret: process.env.JWT_SECRET,
    geminiApiKey: process.env.GEMINI_API_KEY,
    firebaseAdmin: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    },
    tavilyApiKey: process.env.TAVILY_API_KEY,
    qdrantApiKey: process.env.QDRANT_API_KEY,
    qdrantUrl: process.env.QDRANT_URL,
  },

  modules: ['@nuxtjs/tailwindcss'],
  plugins: [
    '~/plugins/firebase.client.js'
  ],
  compatibilityDate: '2025-02-10',
};
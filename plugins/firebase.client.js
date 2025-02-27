// plugins/firebase.client.js
import { defineNuxtPlugin } from '#app'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'

export default defineNuxtPlugin(async () => {
  const firebaseConfig = {
    apiKey: "AIzaSyAO_QqSP41SSxNP4I1gx5wvpRYojHocrDk",
    authDomain: "leaf-4974f.firebaseapp.com",
    projectId: "leaf-4974f",
    storageBucket: "leaf-4974f.firebasestorage.app",
    messagingSenderId: "333381157932",
    appId: "1:333381157932:web:8aa88070347d913030bd89",
    measurementId: "G-VYEYFPBZKX"
  }
  
  // Initialize Firebase
  let app
  if (!getApps().length) {
    app = initializeApp(firebaseConfig)
  } else {
    app = getApps()[0]
  }

  // Configure auth persistence
  const auth = getAuth(app)
  await setPersistence(auth, browserLocalPersistence)
})

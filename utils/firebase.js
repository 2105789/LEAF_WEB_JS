// utils/firebase.js
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyC1-B9QAr3kuFjvOWKJSp52ngLg8m__3b8",
  authDomain: "leafo-20e95.firebaseapp.com",
  projectId: "leafo-20e95",
  storageBucket: "leafo-20e95.firebasestorage.app",
  messagingSenderId: "306355347618",
  appId: "1:306355347618:web:9b757833f87082e216f7fb",
  measurementId: "G-KC9YCP8DLL"
};


// Initialize Firebase
let app
if (!getApps().length) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApps()[0]
}

// Get Auth instance
const auth = getAuth(app)

export { auth }
export default app

// lib/firebase.ts

import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Use environment variables for secure configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Check if all required environment variables are present
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
];

// Only initialize Firebase if configuration is available
if (!getApps().length) {
  const missingVars = requiredEnvVars.filter(
    varName => !process.env[varName]
  );
  
  if (missingVars.length === 0) {
    initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
  } else {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Firebase initialization skipped. Please set the required environment variables.');
  }
}

// Get the app instance whether it was just initialized or already exists
const app = getApps().length ? getApp() : null;

// Initialize services conditionally based on app availability
const auth = app ? getAuth(app) : null;
const provider = new GoogleAuthProvider();
const db = app ? getFirestore(app) : null;
const storage = app ? getStorage(app) : null;

export { app, auth, provider, db, storage };
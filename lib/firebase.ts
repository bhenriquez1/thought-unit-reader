// lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Required variables for Firebase connection
const requiredEnvVars = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
];

const missingVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

// Firebase service instances
let app: FirebaseApp | null = null;
let auth = null;
let provider = null;
let db = null;
let storage = null;

// Connection status flag
let firebaseConnected = false;

if (missingVars.length > 0) {
  console.warn(
    `⚠️ Firebase config is missing: ${missingVars.join(", ")}`
  );
  console.warn("➡️ Firebase features will be disabled until environment variables are set.");
} else {
  try {
    // Initialize Firebase app if not already initialized
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
      console.log("✅ Firebase initialized successfully");
    } else {
      app = getApp();
    }

    // Initialize services
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    db = getFirestore(app);
    storage = getStorage(app);

    firebaseConnected = true;
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
  }
}

// Export all
export { app, auth, provider, db, storage, firebaseConnected };
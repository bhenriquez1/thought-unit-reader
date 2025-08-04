// lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
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

// Required environment variables
const requiredEnvVars = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
];

const missingVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

let app: FirebaseApp;

if (missingVars.length > 0) {
  console.error(
    `❌ Missing required Firebase environment variables: ${missingVars.join(", ")}`
  );
  throw new Error(
    `Missing Firebase config: ${missingVars.join(", ")}`
  );
} else {
  // Initialize Firebase only if not already initialized
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized successfully");
  } else {
    app = getApp();
  }
}

// Initialize services
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, provider, db, storage };
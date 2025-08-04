// lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ✅ Firebase Config (from your .env.local)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// ✅ Check required env variables
const requiredEnvVars = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
];

const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

let app: FirebaseApp;
let firebaseConnected = false;

if (missingVars.length > 0) {
  console.error(`❌ Missing Firebase env vars: ${missingVars.join(", ")}`);
} else {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
      console.log("✅ Firebase initialized successfully");
    } else {
      app = getApp();
      console.log("ℹ️ Firebase already initialized");
    }
    firebaseConnected = true;
  } catch (err) {
    console.error("❌ Firebase initialization error:", err);
  }
}

// ✅ Export initialized services (safe fallback if not connected)
const auth = firebaseConnected ? getAuth(app) : null;
const provider = new GoogleAuthProvider();
const db = firebaseConnected ? getFirestore(app) : null;
const storage = firebaseConnected ? getStorage(app) : null;

export { app, auth, provider, db, storage, firebaseConnected };
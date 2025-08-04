// lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAnMpTQh8-e0L3NBNMMa-izbfIcnijYK5w",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "thought-unit-reader.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "thought-unit-reader",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "thought-unit-reader.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "808239475880",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:808239475880:web:c66b9bf6c553477f78269d",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-5DF8KCFLFG"
};

// Init only once
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("✅ Firebase initialized");
} else {
  app = getApp();
}

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

let firebaseConnected = true;
try {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    firebaseConnected = false;
    console.error("❌ Firebase env vars missing");
  }
} catch {
  firebaseConnected = false;
}

/** ===== 📂 Upload PDF to Firebase ===== */
export async function uploadPDF(file: File, userId: string) {
  const fileRef = ref(storage, `pdfs/${userId}/${file.name}`);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);

  // Store metadata in Firestore
  await setDoc(doc(db, "users", userId), {
    latestPDF: {
      name: file.name,
      url: downloadURL,
      uploadedAt: new Date().toISOString(),
    }
  });

  return downloadURL;
}

/** ===== 📥 Fetch Last Uploaded PDF ===== */
export async function fetchLastPDF(userId: string) {
  const docSnap = await getDoc(doc(db, "users", userId));
  if (docSnap.exists()) {
    return docSnap.data().latestPDF?.url || null;
  }
  return null;
}

export { app, auth, provider, db, storage, firebaseConnected };
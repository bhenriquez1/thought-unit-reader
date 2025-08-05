// lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage";

// 🔹 Firebase Config (from .env)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || ""
};

// 🔹 Initialize Firebase (only once)
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
    console.error("❌ Firebase environment variables missing.");
  }
} catch {
  firebaseConnected = false;
}

/* =========================================================================
   🔹 AUTH FUNCTIONS
   ========================================================================= */
export async function signInWithGoogle(): Promise<User | null> {
  try {
    console.log("🔹 Attempting Google sign-in...");
    const result = await signInWithPopup(auth, provider);
    console.log("✅ Google sign-in success:", result.user);
    return result.user;
  } catch (err: any) {
    console.error("❌ Google Sign-In Error:", err?.message || err);
    alert(`Google Sign-In failed: ${err?.message || err}`);
    return null;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
    console.log("✅ Signed out successfully");
  } catch (err) {
    console.error("❌ Sign-Out Error:", err);
    alert(`Sign-Out failed: ${err}`);
  }
}

export function listenForAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/* =========================================================================
   🔹 PDF LIBRARY FUNCTIONS
   ========================================================================= */
export async function uploadPDF(file: File, userId: string) {
  const fileRef = ref(storage, `pdfs/${userId}/${file.name}`);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);

  const libraryRef = doc(collection(db, "users", userId, "pdfLibrary"));
  await setDoc(libraryRef, {
    name: file.name,
    url: downloadURL,
    uploadedAt: new Date().toISOString()
  });

  return downloadURL;
}

export async function getPDFLibrary(userId: string) {
  const querySnapshot = await getDocs(collection(db, "users", userId, "pdfLibrary"));
  const library: { id: string; name: string; url: string; uploadedAt: string }[] = [];

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    library.push({
      id: docSnap.id,
      name: data.name,
      url: data.url,
      uploadedAt: data.uploadedAt || ""
    });
  });

  // Sort newest first
  return library.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

export async function deletePDF(userId: string, pdfId: string, pdfName: string) {
  await deleteDoc(doc(db, "users", userId, "pdfLibrary", pdfId));
  const fileRef = ref(storage, `pdfs/${userId}/${pdfName}`);
  await deleteObject(fileRef);
  console.log(`🗑 Deleted PDF: ${pdfName}`);
}

/* =========================================================================
   🔹 READING PROGRESS FUNCTIONS
   ========================================================================= */
export async function saveReadingProgress(
  userId: string,
  pdfId: string,
  progress: {
    currentPage: number;
    currentThoughtUnit: number;
    highlightedWord: string;
  }
) {
  const docRef = doc(db, "users", userId, "readingProgress", pdfId);
  await setDoc(
    docRef,
    { ...progress, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function loadReadingProgress(userId: string, pdfId: string) {
  const docRef = doc(db, "users", userId, "readingProgress", pdfId);
  const snap = await getDoc(docRef);
  if (snap.exists()) return snap.data();
  return null;
}

/* =========================================================================
   🔹 METAMASK WALLET CONNECTION
   ========================================================================= */
export async function connectWallet(): Promise<string | null> {
  if (typeof window === "undefined" || !window.ethereum) {
    alert("MetaMask not found. Please install it to connect your wallet.");
    return null;
  }

  try {
    console.log("🔹 Requesting MetaMask connection...");
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });
    console.log("✅ Connected to MetaMask:", accounts[0]);
    return accounts[0];
  } catch (err: any) {
    console.error("❌ MetaMask connection failed:", err?.message || err);
    alert(`MetaMask connection failed: ${err?.message || err}`);
    return null;
  }
}

export { app, auth, provider, db, storage, firebaseConnected };
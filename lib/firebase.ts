// lib/firebase.ts
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  type User,
  GoogleAuthProvider,
  signInWithPopup,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  connectStorageEmulator,
} from "firebase/storage";

/* =========================================================================
   🔹 Firebase Config
   ========================================================================= */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
};

const useEmulators =
  (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS || "").toString() === "1" ||
  (process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS || "").toString().toLowerCase() === "true");

/* =========================================================================
   🔹 Initialize Firebase (singleton)
   ========================================================================= */
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("✅ Firebase initialized");
} else {
  app = getApp();
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Optional: connect to local emulators in dev
if (useEmulators) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    console.log("🟡 Firebase emulators connected");
  } catch (e) {
    console.warn("⚠️ Could not connect Firebase emulators:", e);
  }
}

/** True when the config looks usable — used by the app to gate features. */
const firebaseConnected =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.appId &&
  !!firebaseConfig.storageBucket;

/* =========================================================================
   🔹 Auth Functions
   ========================================================================= */
export function listenForAuthChanges(callback: (user: User | null) => void) {
  // Always register the listener; in dev with emulators it still works.
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    console.error("❌ Google Sign-In Error:", err);
    alert("Google Sign-In failed.");
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
    console.log("👋 Signed out");
  } catch (err) {
    console.error("❌ Sign-Out Error:", err);
  }
}

/* =========================================================================
   🔹 Wallet Connect (Placeholder)
   ========================================================================= */
export async function connectWallet(): Promise<string | null> {
  alert("MetaMask connection is temporarily disabled.");
  return null;
}

/* =========================================================================
   🔹 PDF Library Functions
   ========================================================================= */
export async function uploadPDF(file: File, userId: string): Promise<string> {
  const fileRef = ref(storage, `pdfs/${userId}/${file.name}`);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);

  const libraryRef = doc(collection(db, "users", userId, "pdfLibrary"));
  await setDoc(libraryRef, {
    name: file.name,
    url: downloadURL,
    uploadedAt: new Date().toISOString(),
  });

  return downloadURL;
}

export async function getPDFLibrary(userId: string): Promise<
  { id: string; name: string; url: string; uploadedAt: string }[]
> {
  const querySnapshot = await getDocs(collection(db, "users", userId, "pdfLibrary"));
  const library: { id: string; name: string; url: string; uploadedAt: string }[] = [];

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data() as any;
    library.push({
      id: docSnap.id,
      name: data.name,
      url: data.url,
      uploadedAt: data.uploadedAt || "",
    });
  });

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
   🔹 Reading Progress
   ========================================================================= */
export async function saveReadingProgress(
  userId: string,
  pdfId: string,
  progress: {
    currentPage: number;
    currentThoughtUnit: number;
    highlightedWord: string;
  }
): Promise<void> {
  const docRef = doc(db, "users", userId, "readingProgress", pdfId);
  await setDoc(
    docRef,
    { ...progress, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function loadReadingProgress(
  userId: string,
  pdfId: string
): Promise<any | null> {
  const docRef = doc(db, "users", userId, "readingProgress", pdfId);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
}

/* =========================================================================
   🔹 Exports
   ========================================================================= */
export { app, auth, db, storage, firebaseConnected };
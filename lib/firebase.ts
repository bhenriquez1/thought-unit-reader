// lib/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage";

/** ===== Firebase Config ===== **/
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyXXXXXX",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "thought-unit-reader.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "thought-unit-reader",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "thought-unit-reader.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "808239475880",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:808239475880:web:xxxxxx",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-XXXXXXX"
};

/** ===== Init Firebase ===== **/
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("✅ Firebase initialized");
} else {
  app = getApp();
}

/** ===== Services ===== **/
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

/** ===== Connection Flag ===== **/
let firebaseConnected = true;
try {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    firebaseConnected = false;
    console.error("❌ Firebase env vars missing");
  }
} catch {
  firebaseConnected = false;
}

/** =========================================================
 * 🔑 Google Sign-In / Sign-Out
 * ======================================================= */
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    console.log("✅ Signed in as:", user.email);

    // Create user doc if not exists
    const userDocRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
      await setDoc(userDocRef, {
        email: user.email,
        createdAt: serverTimestamp()
      });
    }
    return user;
  } catch (err) {
    console.error("❌ Google sign-in failed:", err);
    return null;
  }
}

export async function signOutUser() {
  await signOut(auth);
  console.log("✅ Signed out");
}

/** =========================================================
 * 📂 Upload PDF → Saves in user library
 * ======================================================= */
export async function uploadPDF(file: File, userId: string) {
  const fileRef = ref(storage, `pdfs/${userId}/${file.name}`);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);

  // Create Firestore record
  const libraryItemRef = doc(collection(db, "users", userId, "pdfLibrary"));
  await setDoc(libraryItemRef, {
    name: file.name,
    url: downloadURL,
    uploadedAt: serverTimestamp()
  });

  return downloadURL;
}

/** =========================================================
 * 📥 Get all PDFs in library
 * ======================================================= */
export async function getPDFLibrary(userId: string) {
  const querySnapshot = await getDocs(collection(db, "users", userId, "pdfLibrary"));
  const library: { id: string; name: string; url: string; uploadedAt: any }[] = [];

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    library.push({
      id: docSnap.id,
      name: data.name,
      url: data.url,
      uploadedAt: data.uploadedAt || null
    });
  });

  // Sort newest first
  library.sort((a, b) => {
    const aTime = a.uploadedAt?.toMillis?.() || 0;
    const bTime = b.uploadedAt?.toMillis?.() || 0;
    return bTime - aTime;
  });

  return library;
}

/** =========================================================
 * 🗑 Delete PDF from library & storage
 * ======================================================= */
export async function deletePDF(userId: string, pdfId: string, pdfName: string) {
  // Delete Firestore record
  await deleteDoc(doc(db, "users", userId, "pdfLibrary", pdfId));

  // Delete from Storage
  const fileRef = ref(storage, `pdfs/${userId}/${pdfName}`);
  await deleteObject(fileRef);

  console.log(`🗑 Deleted PDF: ${pdfName}`);
}

export { app, auth, provider, db, storage, firebaseConnected };
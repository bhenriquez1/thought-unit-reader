// lib/firebase.ts
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  type User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
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
   🔹 Firebase Config (from .env.local)
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
    (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS || "")
      .toString()
      .toLowerCase() === "true");

/* =========================================================================
   🔹 Initialize Firebase (singleton)
   ========================================================================= */
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/** True when the config looks usable — used by the app to gate features. */
const firebaseConnected =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.appId &&
  !!firebaseConfig.storageBucket;

/* =========================================================================
   🔹 Auth persistence (handles Private Browsing)
   ========================================================================= */
if (typeof window !== "undefined") {
  // Try durable storage; if blocked (Safari Private, iframe, etc.), fall back in-memory.
  setPersistence(auth, browserLocalPersistence).catch(() =>
    setPersistence(auth, inMemoryPersistence).catch(() => {
      /* ignore */
    })
  );
  try {
    auth.languageCode = navigator.language || "en";
  } catch {
    /* ignore */
  }
}

/* =========================================================================
   🔹 Optional: connect to local emulators in dev (guard against duplicates)
   ========================================================================= */
declare global {
  interface Window {
    __FIREBASE_EMU_CONNECTED__?: boolean;
  }
}
if (useEmulators && typeof window !== "undefined" && !window.__FIREBASE_EMU_CONNECTED__) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    window.__FIREBASE_EMU_CONNECTED__ = true;
  } catch {
    /* ignore */
  }
}

/* =========================================================================
   🔹 Auth Helpers
   ========================================================================= */
export function listenForAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

function popupLikelyBlocked(err: unknown) {
  const code = (err as any)?.code || (err as any)?.name || "";
  const msg = String((err as any)?.message || "").toLowerCase();
  return String(code).includes("popup") || msg.includes("popup") || msg.includes("blocked");
}

function shouldUseRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  // Popup auth is flaky in these environments — prefer redirect.
  return isIOS || isSafari || inIframe;
}

function readableAuthError(err: any): string {
  const code: string = err?.code || "";
  switch (code) {
    case "auth/unauthorized-domain":
      return "This domain isn’t authorized for Firebase Auth. Add your site domain under Firebase Auth → Settings → Authorized domains.";
    case "auth/invalid-api-key":
      return "Invalid Firebase API key. Check your NEXT_PUBLIC_FIREBASE_API_KEY.";
    case "auth/invalid-credential":
    case "auth/invalid-id-token":
      return "Invalid credential. Try again or clear cookies for this site.";
    case "auth/popup-closed-by-user":
      return "Popup was closed before completing the sign-in.";
    default:
      return `Google Sign-In failed (${code || "unknown"}). Check console for details.`;
  }
}

async function ensureUserProfile(u: User) {
  try {
    const uref = doc(db, "users", u.uid);
    await setDoc(
      uref,
      {
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || null,
        photoURL: u.photoURL || null,
        providerIds: (u.providerData || []).map((p) => p?.providerId).filter(Boolean),
        lastLoginAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {
    /* ignore */
  }
}

/** Call on button click. Uses popup when possible; falls back to redirect automatically. */
export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // Some environments should default to redirect
  if (typeof window !== "undefined" && shouldUseRedirect()) {
    await signInWithRedirect(auth, provider);
    return null; // Result delivered after redirect; see handleRedirectResult()
  }

  try {
    const result = await signInWithPopup(auth, provider);
    if (result?.user) {
      await ensureUserProfile(result.user);
      return result.user;
    }
    return null;
  } catch (err) {
    if (popupLikelyBlocked(err)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    console.error("❌ Google Sign-In Error:", err);
    if (typeof window !== "undefined") alert(readableAuthError(err));
    return null;
  }
}

/** Call once on app load to complete redirect sign-ins. Safe to call even if no redirect happened. */
export async function handleRedirectResult(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    if (res?.user) {
      await ensureUserProfile(res.user);
      return res.user;
    }
    return null;
  } catch (err) {
    console.error("❌ Redirect result error:", err);
    if (typeof window !== "undefined") {
      alert(readableAuthError(err));
    }
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("❌ Sign-Out Error:", err);
  }
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

export async function getPDFLibrary(
  userId: string
): Promise<{ id: string; name: string; url: string; uploadedAt: string }[]> {
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
}

/* =========================================================================
   🔹 Reading Progress (shared path + guest fallback)
   ========================================================================= */
type ProgressPatch = Partial<{
  currentPage: number;
  currentThoughtUnit: number;
  highlightedWord: string;
  readingSpeed: number;
}>;

const LS_KEY = (uid: string, pdfId: string) => `rp::${uid || "guest"}::${pdfId}`;

export async function saveReadingProgress(
  userId: string,
  pdfId: string,
  progress: ProgressPatch
): Promise<void> {
  const uid = userId || "guest-user";
  const isGuest = !firebaseConnected || uid === "guest-user";

  if (isGuest) {
    // LocalStorage fallback so Progressive/Hybrid still “remember” for guests
    try {
      const key = LS_KEY(uid, pdfId);
      const prev = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(
        key,
        JSON.stringify({ ...prev, ...progress, updatedAt: new Date().toISOString() })
      );
    } catch {
      /* ignore */
    }
    return;
  }

  const docRef = doc(db, "users", uid, "readingProgress", pdfId);
  await setDoc(
    docRef,
    { ...progress, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function loadReadingProgress(
  userId: string,
  pdfId: string
): Promise<ProgressPatch | null> {
  const uid = userId || "guest-user";
  const isGuest = !firebaseConnected || uid === "guest-user";

  if (isGuest) {
    try {
      const raw = localStorage.getItem(LS_KEY(uid, pdfId));
      return raw ? (JSON.parse(raw) as ProgressPatch) : null;
    } catch {
      return null;
    }
  }

  const docRef = doc(db, "users", uid, "readingProgress", pdfId);
  const snap = await getDoc(docRef);
  return snap.exists() ? (snap.data() as ProgressPatch) : null;
}

/* =========================================================================
   🔹 Exports
   ========================================================================= */
export { app, auth, db, storage, firebaseConnected, useEmulators };
export type { User };
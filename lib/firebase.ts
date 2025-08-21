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
  apiKey: (process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "").replace(/^=+/, ""), // Remove leading = characters
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || "",
};

// Validate Firebase configuration
const validateFirebaseConfig = () => {
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'];
  const missing = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);
  
  if (missing.length > 0) {
    console.warn('⚠️ Missing Firebase config fields:', missing);
    return false;
  }
  
  // Validate API key format (should start with AIza and be 39-40 characters)
  if (!firebaseConfig.apiKey.startsWith('AIza') || firebaseConfig.apiKey.length < 39 || firebaseConfig.apiKey.length > 40) {
    console.error('❌ Invalid Firebase API key format. Expected format: AIza... (39-40 characters)');
    console.error('❌ Current API key:', firebaseConfig.apiKey);
    console.error('❌ Current length:', firebaseConfig.apiKey.length);
    return false;
  }
  
  console.log('✅ Firebase configuration validated successfully');
  return true;
};

const isValidConfig = validateFirebaseConfig();

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
const firebaseConnected = isValidConfig &&
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.appId &&
  !!firebaseConfig.storageBucket;

/* =========================================================================
   🔹 Auth persistence (handles Private Browsing)
   ========================================================================= */
if (typeof window !== "undefined") {
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
  // Check if Google Sign-In is disabled and we should use mock user
  const isDisabled = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN === "1";
  
  if (isDisabled && typeof window !== "undefined") {
    // Check if we have a stored mock user
    const storedUser = localStorage.getItem("mock-auth-user");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        const mockUser = {
          uid: userData.uid,
          email: userData.email,
          displayName: userData.displayName,
          photoURL: null,
          emailVerified: true,
          isAnonymous: false,
          providerData: [],
          refreshToken: "mock-refresh-token",
          tenantId: null,
          delete: async () => {},
          getIdToken: async () => "mock-id-token",
          getIdTokenResult: async () => ({} as any),
          reload: async () => {},
          toJSON: () => ({})
        } as User;
        
        // Immediately call callback with mock user
        setTimeout(() => callback(mockUser), 0);
        
        // Return a dummy unsubscribe function
        return () => {};
      } catch {
        // If parsing fails, fall through to normal auth
      }
    } else {
      // No stored user, call callback with null initially
      setTimeout(() => callback(null), 0);
      return () => {};
    }
  }
  
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
  return isIOS || isSafari || inIframe;
}

function readableAuthError(err: any): string {
  const code: string = err?.code || "";
  const currentDomain = typeof window !== "undefined" ? window.location.hostname : "unknown";
  
  switch (code) {
    case "auth/unauthorized-domain":
      return `This domain (${currentDomain}) isn't authorized for Firebase Auth. Add your site domain under Firebase Auth → Settings → Authorized domains.`;
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return `Invalid Firebase API key or domain not authorized. Current domain: ${currentDomain}. Check your Firebase project settings and add this domain to authorized domains.`;
    case "auth/invalid-credential":
    case "auth/invalid-id-token":
      return "Invalid credential. Try again or clear cookies for this site.";
    case "auth/popup-closed-by-user":
      return "Popup was closed before completing the sign-in.";
    case "auth/operation-not-allowed":
      return "Google Sign-In is not enabled in Firebase Auth. Enable it in Firebase Console → Authentication → Sign-in method.";
    default:
      return `Google Sign-In failed (${code || "unknown"}). Current domain: ${currentDomain}. Check console for details and ensure this domain is authorized in Firebase Auth settings.`;
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
  // Check if Google Sign-In is temporarily disabled
  const isDisabled = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN === "1";
  if (isDisabled) {
    console.log("ℹ️ Google Sign-In disabled, using mock authenticated user");
    // Return a mock authenticated user so app functions normally
    const mockUser = {
      uid: "mock-user-dev",
      email: "dev@thought-unit-reader.com",
      displayName: "Development User",
      photoURL: null,
      emailVerified: true,
      isAnonymous: false,
      providerData: [],
      refreshToken: "mock-refresh-token",
      tenantId: null,
      delete: async () => {},
      getIdToken: async () => "mock-id-token",
      getIdTokenResult: async () => ({} as any),
      reload: async () => {},
      toJSON: () => ({})
    } as User;
    
    // Store mock user info in localStorage for persistence
    if (typeof window !== "undefined") {
      localStorage.setItem("mock-auth-user", JSON.stringify({
        uid: mockUser.uid,
        email: mockUser.email,
        displayName: mockUser.displayName
      }));
    }
    
    return mockUser;
  }

  // Check if Firebase is properly configured before attempting sign-in
  if (!isValidConfig) {
    const errorMsg = "Firebase configuration is invalid. Please check your environment variables.";
    console.error("❌", errorMsg);
    if (typeof window !== "undefined") alert(errorMsg);
    return null;
  }

  if (!firebaseConnected) {
    const errorMsg = "Firebase is not properly connected. Please check your configuration.";
    console.error("❌", errorMsg);
    if (typeof window !== "undefined") alert(errorMsg);
    return null;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  if (typeof window !== "undefined" && shouldUseRedirect()) {
    try {
      await signInWithRedirect(auth, provider);
      return null; // Result after redirect; see handleRedirectResult()
    } catch (err) {
      console.error("❌ Google Sign-In Redirect Error:", err);
      if (typeof window !== "undefined") alert(readableAuthError(err));
      return null;
    }
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
      try {
        await signInWithRedirect(auth, provider);
        return null;
      } catch (redirectErr) {
        console.error("❌ Google Sign-In Redirect Fallback Error:", redirectErr);
        if (typeof window !== "undefined") alert(readableAuthError(redirectErr));
        return null;
      }
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
    if (typeof window !== "undefined") alert(readableAuthError(err));
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  // Check if Google Sign-In is disabled and we're using mock user
  const isDisabled = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN === "1";
  
  if (isDisabled && typeof window !== "undefined") {
    // Clear mock user from localStorage
    localStorage.removeItem("mock-auth-user");
    console.log("ℹ️ Mock user signed out");
    return;
  }
  
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
   🔹 Reading Progress (now matches rules: /users/{uid}/books/{bookId}/progress)
   ========================================================================= */
type ProgressPatch = Partial<{
  currentPage: number;
  currentThoughtUnit: number;
  highlightedWord: string;
  readingSpeed: number;
}>;

const LS_KEY = (uid: string, bookId: string) => `rp::${uid || "guest"}::book::${bookId}`;

export async function saveReadingProgress(
  userId: string,
  bookId: string,
  progress: ProgressPatch
): Promise<void> {
  const uid = userId || "guest-user";
  const isGuest = !firebaseConnected || uid === "guest-user";

  if (isGuest) {
    try {
      const key = LS_KEY(uid, bookId);
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

  const docRef = doc(db, "users", uid, "books", bookId, "progress");
  await setDoc(docRef, { ...progress, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function loadReadingProgress(
  userId: string,
  bookId: string
): Promise<ProgressPatch | null> {
  const uid = userId || "guest-user";
  const isGuest = !firebaseConnected || uid === "guest-user";

  if (isGuest) {
    try {
      const raw = localStorage.getItem(LS_KEY(uid, bookId));
      return raw ? (JSON.parse(raw) as ProgressPatch) : null;
    } catch {
      return null;
    }
  }

  const docRef = doc(db, "users", uid, "books", bookId, "progress");
  const snap = await getDoc(docRef);
  return snap.exists() ? (snap.data() as ProgressPatch) : null;
}

/* =========================================================================
   🔹 Exports
   ========================================================================= */
export { app, auth, db, storage, firebaseConnected, useEmulators };
export type { User };

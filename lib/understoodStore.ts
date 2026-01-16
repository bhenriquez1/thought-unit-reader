// lib/understoodStore.ts
// Persists “Got it” by user/book/chunk in Firestore, with guest fallback.

import { getDbInstance, firebaseConnected } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

const GUEST_IDS = new Set(["guest", "guest-user", ""]);
const isBrowser = typeof window !== "undefined";
const lsKey = (uid: string, bookId: string) => `understood::${uid || "guest"}::${bookId || "book"}`;

function isGuest(uid?: string) {
  return !firebaseConnected || !uid || GUEST_IDS.has(uid);
}

/* ------------------------- LocalStorage helpers ------------------------- */
function loadFromLS(uid: string, bookId: string): Record<string, true> {
  if (!isBrowser) return {};
  try {
    const raw = localStorage.getItem(lsKey(uid, bookId));
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function saveToLS(uid: string, bookId: string, map: Record<string, true>) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(lsKey(uid, bookId), JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

/* ------------------------------ Public API ------------------------------ */

export async function loadUnderstood(
  uid: string,
  bookId: string
): Promise<Record<string, true>> {
  if (!uid || !bookId) return {};

  // Guest/session fallback
  if (isGuest(uid)) return loadFromLS(uid, bookId);

  try {
    const col = collection(db, "users", uid, "books", bookId, "understood");
    const snap = await getDocs(col);
    const out: Record<string, true> = {};
    snap.forEach((d) => (out[d.id] = true));
    return out;
  } catch (err) {
    // If rules/network fail, don’t break UX — fall back to LS
    return loadFromLS(uid, bookId);
  }
}

/**
 * If `value` is undefined: toggle.
 * If `value` is true: mark understood.
 * If `value` is false: clear.
 */
export async function markUnderstood(
  uid: string,
  bookId: string,
  chunkId: string,
  value?: boolean
): Promise<void> {
  if (!uid || !bookId || !chunkId) return;

  // Guest/session path
  if (isGuest(uid)) {
    const state = loadFromLS(uid, bookId);
    if (value === undefined) {
      if (state[chunkId]) delete state[chunkId];
      else state[chunkId] = true;
    } else if (value) {
      state[chunkId] = true;
    } else {
      delete state[chunkId];
    }
    saveToLS(uid, bookId, state);
    return;
  }

  // Firestore path
  try {
    const ref = doc(db, "users", uid, "books", bookId, "understood", chunkId);

    if (value === undefined) {
      const cur = await getDoc(ref);
      if (cur.exists()) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, { understood: true, updatedAt: serverTimestamp() }, { merge: true });
      }
      return;
    }

    if (value) {
      await setDoc(ref, { understood: true, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await deleteDoc(ref);
    }
  } catch {
    // Swallow on purpose — UX should not crash due to rules/network.
  }
}
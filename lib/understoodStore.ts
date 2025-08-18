// Persists “Got it” by user/book/chunk in Firestore
import "@/lib/firebase"; // ensure the app is initialized
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

const db = getFirestore();

export async function loadUnderstood(
  uid: string,
  bookId: string
): Promise<Record<string, true>> {
  if (!uid || !bookId) return {};
  const col = collection(db, "users", uid, "books", bookId, "understood");
  const snap = await getDocs(col);
  const out: Record<string, true> = {};
  snap.forEach((d) => (out[d.id] = true));
  return out;
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
}
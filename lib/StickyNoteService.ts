// lib/StickyNoteService.ts
// ✅ Backwards compatible page-based notes API (your old one)
// ✅ New step-based notes API for whiteboard overlay
// ✅ Firestore (lazy) when available; localStorage fallback when not (static-export friendly)

export type Timestampish = any;

/* ------------------------------- Page Notes ------------------------------- */

export interface StickyNote {
  id?: string;
  userId: string;
  childName?: string; // For Elena Mode multi-user
  fileId: string;
  pageNumber: number;
  content: string;
  createdAt?: Timestampish;
  updatedAt?: Timestampish;
}

// LocalStorage bucket for page notes (flat array of all notes)
const LS_PAGE_NOTES_KEY = "wb:pageNotes:all";

function readAllPageNotes(): StickyNote[] {
  try {
    const raw = localStorage.getItem(LS_PAGE_NOTES_KEY);
    return raw ? (JSON.parse(raw) as StickyNote[]) : [];
  } catch {
    return [];
  }
}

function writeAllPageNotes(notes: StickyNote[]) {
  try {
    localStorage.setItem(LS_PAGE_NOTES_KEY, JSON.stringify(notes));
  } catch {}
}

async function getDB() {
  try {
    // prefer your firebase.ts export if present
    const mod = await import("./firebase").catch(() => null);
    if (mod?.db) return mod.db;

    // fallback: try to get default app
    const { getApps, getApp } = await import("firebase/app");
    if (getApps().length === 0) return null;
    const { getFirestore } = await import("firebase/firestore");
    return getFirestore(getApp());
  } catch {
    return null;
  }
}

// 🔹 Create new sticky note (page-based)
export async function createStickyNote(note: StickyNote): Promise<string> {
  const db = await getDB();
  if (!db) {
    const all = readAllPageNotes();
    const id = crypto.randomUUID();
    const now = Date.now();
    all.push({ ...note, id, createdAt: now, updatedAt: now });
    writeAllPageNotes(all);
    return id;
  }

  const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
  const ref = await addDoc(collection(db, "stickyNotes"), {
    ...note,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// 🔹 Fetch notes for a file (optionally filtered by child)
export async function fetchStickyNotes(
  userId: string,
  fileId: string,
  childName?: string
): Promise<StickyNote[]> {
  const db = await getDB();
  if (!db) {
    const all = readAllPageNotes();
    return all.filter(
      (n) =>
        n.userId === userId &&
        n.fileId === fileId &&
        (!childName || n.childName === childName)
    );
  }

  // Use a proper query (your old version fetched all then filtered)
  const {
    collection,
    getDocs,
    query,
    where,
    orderBy,
  } = await import("firebase/firestore");

  const base = collection(db, "stickyNotes");
  const clauses: any[] = [where("userId", "==", userId), where("fileId", "==", fileId)];
  if (childName) clauses.push(where("childName", "==", childName));
  const q = query(base, ...clauses, orderBy("createdAt", "asc"));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as StickyNote) }));
}

// 🔹 Update sticky note content
export async function updateStickyNote(noteId: string, updatedContent: string) {
  const db = await getDB();
  if (!db) {
    const all = readAllPageNotes();
    const next = all.map((n) =>
      n.id === noteId ? { ...n, content: updatedContent, updatedAt: Date.now() } : n
    );
    writeAllPageNotes(next);
    return;
  }

  const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
  const ref = doc(db, "stickyNotes", noteId);
  await updateDoc(ref, { content: updatedContent, updatedAt: serverTimestamp() });
}

// 🔹 Delete sticky note
export async function deleteStickyNote(noteId: string) {
  const db = await getDB();
  if (!db) {
    const all = readAllPageNotes();
    writeAllPageNotes(all.filter((n) => n.id !== noteId));
    return;
  }

  const { doc, deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "stickyNotes", noteId));
}

/* ------------------------------- Step Notes --------------------------------
   Used by the Whiteboard overlay. Stored under:
   Firestore: lessons/{lessonId}/stepNotes
   LocalStorage: wb:notes:<lessonId>
---------------------------------------------------------------------------- */

export type StepNote = {
  id: string;            // doc id or local id
  step: number;          // 0-based step index
  content: string;
  userId?: string;
  createdAt?: Timestampish;
  updatedAt?: Timestampish;
};

type StepNoteSubscriber = (notes: StepNote[]) => void;

const LS_STEP_PREFIX = "wb:notes:";

function lsKey(lessonId: string) {
  return `${LS_STEP_PREFIX}${lessonId || "local"}`;
}

function readLocalStepNotes(lessonId: string): StepNote[] {
  try {
    const raw = localStorage.getItem(lsKey(lessonId));
    return raw ? (JSON.parse(raw) as StepNote[]) : [];
  } catch {
    return [];
  }
}

function writeLocalStepNotes(lessonId: string, notes: StepNote[]) {
  try {
    localStorage.setItem(lsKey(lessonId), JSON.stringify(notes));
  } catch {}
}

export function subscribeLocalNotes(lessonId: string, onChange: StepNoteSubscriber) {
  // initial emit
  onChange(readLocalStepNotes(lessonId));

  const handler = (e: StorageEvent) => {
    if (e.key === lsKey(lessonId)) {
      onChange(readLocalStepNotes(lessonId));
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/** Subscribe to step notes; Firestore if available, else localStorage. */
export async function subscribeStepNotes(
  lessonId: string,
  opts: { userId?: string } = {},
  onChange?: StepNoteSubscriber
): Promise<() => void> {
  const db = await getDB();
  if (!db || typeof window === "undefined") {
    return subscribeLocalNotes(lessonId, (rows) => onChange?.(rows));
  }

  const {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
  } = await import("firebase/firestore");
  const base = collection(db, "lessons", lessonId, "stepNotes");
  const q = opts.userId
    ? query(base, where("userId", "==", opts.userId), orderBy("createdAt", "asc"))
    : query(base, orderBy("createdAt", "asc"));

  const unsub = onSnapshot(q, (snap) => {
    const rows: StepNote[] = snap.docs.map((d) => {
      const data: any = d.data();
      return {
        id: d.id,
        step: data.step ?? 0,
        content: data.content ?? "",
        userId: data.userId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });
    onChange?.(rows);
  });

  return unsub;
}

export async function addStepNote(
  lessonId: string,
  note: Omit<StepNote, "id">
): Promise<StepNote> {
  const db = await getDB();
  if (!db) {
    const all = readLocalStepNotes(lessonId);
    const created: StepNote = { ...note, id: crypto.randomUUID() };
    writeLocalStepNotes(lessonId, [...all, created]);
    return created;
  }

  const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
  const ref = collection(db, "lessons", lessonId, "stepNotes");
  const docRef = await addDoc(ref, {
    ...note,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { ...note, id: docRef.id };
}

export async function updateStepNote(
  lessonId: string,
  id: string,
  patch: Partial<StepNote>
) {
  const db = await getDB();
  if (!db) {
    const all = readLocalStepNotes(lessonId);
    const next = all.map((n) => (n.id === id ? { ...n, ...patch } : n));
    writeLocalStepNotes(lessonId, next);
    return;
  }

  const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
  const ref = doc(db, "lessons", lessonId, "stepNotes", id);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteStepNote(lessonId: string, id: string) {
  const db = await getDB();
  if (!db) {
    const all = readLocalStepNotes(lessonId);
    writeLocalStepNotes(lessonId, all.filter((n) => n.id !== id));
    return;
  }

  const { doc, deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "lessons", lessonId, "stepNotes", id));
}
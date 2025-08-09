// lib/StickyNoteService.ts
// ✅ Backwards compatible page-based notes API (your old one)
// ✅ New lesson-scoped sticky notes API for general “drawer” UI
// ✅ Step-based notes API for whiteboard overlay (unchanged)
// ✅ Firestore (lazy) when available; localStorage fallback when not

export type Timestampish = any;

/* =============================================================================
   Helpers
============================================================================= */

async function getDB() {
  try {
    // Prefer your firebase.ts export if present
    const mod = await import("./firebase").catch(() => null);
    if (mod?.db) return mod.db;

    // Fallback: use default app if already initialized
    const { getApps, getApp } = await import("firebase/app");
    if (getApps().length === 0) return null;
    const { getFirestore } = await import("firebase/firestore");
    return getFirestore(getApp());
  } catch {
    return null;
  }
}

/* =============================================================================
   A) Page-based sticky notes (legacy, kept for compatibility)
============================================================================= */

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

// 🔹 Create (legacy form)
export async function createStickyNote(note: StickyNote): Promise<string>;
// 🔹 Create (lesson-scoped form overload)
export async function createStickyNote(
  lessonId: string,
  data: { text: string; page?: number | null; userId?: string | null }
): Promise<{ id: string; text: string; page?: number | null; userId?: string | null }>;
export async function createStickyNote(
  arg1: StickyNote | string,
  arg2?: { text: string; page?: number | null; userId?: string | null }
): Promise<any> {
  // --- New lesson-scoped API ---
  if (typeof arg1 === "string") {
    const lessonId = arg1;
    const payload = arg2!;
    const db = await getDB();

    if (!db) {
      // local fallback: per-lesson bucket
      const all = readLocalLessonNotes(lessonId);
      const created = {
        id: crypto.randomUUID(),
        text: payload.text,
        page: payload.page ?? null,
        userId: payload.userId ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      writeLocalLessonNotes(lessonId, [...all, created]);
      return created;
    }

    const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
    const ref = collection(db, "lessons", lessonId, "stickyNotes");
    const docRef = await addDoc(ref, {
      text: payload.text,
      page: payload.page ?? null,
      userId: payload.userId ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, ...payload };
  }

  // --- Legacy page-based API ---
  const note = arg1 as StickyNote;
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

// 🔹 Read legacy (kept as-is)
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

  const { collection, getDocs, query, where, orderBy } = await import("firebase/firestore");
  const base = collection(db, "stickyNotes");
  const clauses: any[] = [where("userId", "==", userId), where("fileId", "==", fileId)];
  if (childName) clauses.push(where("childName", "==", childName));
  const q = query(base, ...clauses, orderBy("createdAt", "asc"));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as StickyNote) }));
}

// 🔹 Update (legacy form)
export async function updateStickyNote(noteId: string, updatedContent: string): Promise<void>;
// 🔹 Update (lesson-scoped form overload)
export async function updateStickyNote(
  lessonId: string,
  id: string,
  patch: { text?: string; page?: number | null }
): Promise<void>;
export async function updateStickyNote(
  a: string,
  b: string,
  c?: { text?: string; page?: number | null }
): Promise<void> {
  // Lesson-scoped overload
  if (typeof c === "object") {
    const lessonId = a;
    const id = b;
    const patch = c || {};
    const db = await getDB();

    if (!db) {
      const all = readLocalLessonNotes(lessonId);
      const next = all.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
      );
      writeLocalLessonNotes(lessonId, next);
      return;
    }

    const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
    const ref = doc(db, "lessons", lessonId, "stickyNotes", id);
    await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
    return;
  }

  // Legacy form
  const noteId = a;
  const updatedContent = b;
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

// 🔹 Delete (legacy form)
export async function deleteStickyNote(noteId: string): Promise<void>;
// 🔹 Delete (lesson-scoped form overload)
export async function deleteStickyNote(lessonId: string, id: string): Promise<void>;
export async function deleteStickyNote(a: string, b?: string): Promise<void> {
  // Lesson-scoped overload
  if (typeof b === "string") {
    const lessonId = a;
    const id = b;
    const db = await getDB();

    if (!db) {
      const all = readLocalLessonNotes(lessonId);
      writeLocalLessonNotes(lessonId, all.filter((n) => n.id !== id));
      return;
    }

    const { doc, deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "lessons", lessonId, "stickyNotes", id));
    return;
  }

  // Legacy form
  const noteId = a;
  const db = await getDB();
  if (!db) {
    const all = readAllPageNotes();
    writeAllPageNotes(all.filter((n) => n.id !== noteId));
    return;
  }

  const { doc, deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "stickyNotes", noteId));
}

/* =============================================================================
   B) Lesson-scoped sticky notes (new, for your drawer)
============================================================================= */

type LessonStickyNote = {
  id: string;
  text: string;
  page?: number | null;
  userId?: string | null;
  createdAt?: Timestampish;
  updatedAt?: Timestampish;
};

const LS_LESSON_PREFIX = "wb:sticky:";

function lsLessonKey(lessonId: string) {
  return `${LS_LESSON_PREFIX}${lessonId || "local"}`;
}

function readLocalLessonNotes(lessonId: string): LessonStickyNote[] {
  try {
    const raw = localStorage.getItem(lsLessonKey(lessonId));
    return raw ? (JSON.parse(raw) as LessonStickyNote[]) : [];
  } catch {
    return [];
  }
}

function writeLocalLessonNotes(lessonId: string, notes: LessonStickyNote[]) {
  try {
    localStorage.setItem(lsLessonKey(lessonId), JSON.stringify(notes));
  } catch {}
}

/** List all lesson-scoped notes for a drawer */
export async function getStickyNotes(lessonId: string): Promise<LessonStickyNote[]> {
  const db = await getDB();
  if (!db) return readLocalLessonNotes(lessonId);

  const { collection, getDocs, orderBy, query } = await import("firebase/firestore");
  const base = collection(db, "lessons", lessonId, "stickyNotes");
  const q = query(base, orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data: any = d.data();
    return {
      id: d.id,
      text: data.text ?? "",
      page: data.page ?? null,
      userId: data.userId ?? null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  });
}

/* =============================================================================
   C) Whiteboard step-notes (unchanged)
   Stored under: Firestore lessons/{lessonId}/stepNotes
   Local: wb:notes:<lessonId>
============================================================================= */

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

  const { collection, onSnapshot, orderBy, query, where } = await import("firebase/firestore");
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
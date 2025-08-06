import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  query,
  where,
  Timestamp
} from "firebase/firestore";

export interface RightBrainNote {
  id?: string;
  title: string;
  content: string;
  tags: string[];
  attachments: string[];
  bookId: string;
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Save a new note for a specific user and book
 */
export async function saveNote(
  userId: string,
  note: Omit<RightBrainNote, "id" | "createdAt" | "updatedAt">
) {
  const notesRef = collection(db, "users", userId, "notes");
  const docRef = await addDoc(notesRef, {
    ...note,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });
  return docRef.id;
}

/**
 * Update an existing note
 */
export async function updateNote(
  userId: string,
  noteId: string,
  note: Partial<RightBrainNote>
) {
  const noteRef = doc(db, "users", userId, "notes", noteId);
  await updateDoc(noteRef, {
    ...note,
    updatedAt: Timestamp.now()
  });
}

/**
 * Get all notes for a specific book
 */
export async function getNotesForBook(
  userId: string,
  bookId: string
): Promise<RightBrainNote[]> {
  const notesRef = collection(db, "users", userId, "notes");
  const q = query(notesRef, where("bookId", "==", bookId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  })) as RightBrainNote[];
}

/**
 * Save a flashcard for a specific user
 */
export async function saveFlashcard(
  userId: string,
  flashcard: {
    front: string;
    back: string;
    bookId: string;
    tags?: string[];
    dueDate?: string;
  }
) {
  const flashcardsRef = collection(db, "users", userId, "flashcards");
  await addDoc(flashcardsRef, {
    ...flashcard,
    tags: flashcard.tags || [],
    dueDate: flashcard.dueDate || null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });
}
// lib/noteService.ts
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

/* =========================================================================
   🔹 Interfaces
   ========================================================================= */
export interface RightBrainNote {
  id?: string;
  title: string;
  content: string;
  mnemonic?: string;
  tags: string[];
  attachments: string[];
  bookId: string;
  page?: number | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface Flashcard {
  front: string;
  back: string;
  bookId: string;
  tags: string[];
  dueDate: string;
}

export interface MindMapNode {
  title: string;
  content: string;
  mnemonic?: string;
  tags: string[];
  attachments: string[];
  bookId: string;
  page?: number | null;
}

/* =========================================================================
   🔹 Notes (Right Brain)
   ========================================================================= */
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

/* =========================================================================
   🔹 Flashcards
   ========================================================================= */
export async function saveFlashcard(userId: string, flashcard: Flashcard) {
  const flashcardRef = collection(db, "users", userId, "flashcards");
  await addDoc(flashcardRef, {
    ...flashcard,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });
}

/* =========================================================================
   🔹 Mind Map Nodes
   ========================================================================= */
export async function saveMindMapNode(userId: string, node: MindMapNode) {
  const mindMapRef = collection(db, "users", userId, "mindMap");
  await addDoc(mindMapRef, {
    ...node,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });
}
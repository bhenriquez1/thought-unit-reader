// lib/StickyNoteService.ts
import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  Timestamp
} from 'firebase/firestore';

export interface StickyNote {
  id?: string;
  userId: string;
  childName?: string; // For Elena Mode multi-user
  fileId: string;
  pageNumber: number;
  content: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// 🔹 Create new sticky note
export async function createStickyNote(note: StickyNote): Promise<string> {
  const noteRef = await addDoc(collection(db, 'stickyNotes'), {
    ...note,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });
  return noteRef.id;
}

// 🔹 Fetch notes for a file (optionally filtered by child)
export async function fetchStickyNotes(
  userId: string,
  fileId: string,
  childName?: string
): Promise<StickyNote[]> {
  const notesRef = collection(db, 'stickyNotes');
  const notesSnap = await getDocs(notesRef);
  const notes: StickyNote[] = [];

  notesSnap.forEach((docSnap) => {
    const data = docSnap.data() as StickyNote;
    if (
      data.userId === userId &&
      data.fileId === fileId &&
      (!childName || data.childName === childName)
    ) {
      notes.push({ ...data, id: docSnap.id });
    }
  });

  return notes;
}

// 🔹 Update sticky note content
export async function updateStickyNote(noteId: string, updatedContent: string) {
  const noteRef = doc(db, 'stickyNotes', noteId);
  await updateDoc(noteRef, {
    content: updatedContent,
    updatedAt: Timestamp.now()
  });
}

// 🔹 Delete sticky note
export async function deleteStickyNote(noteId: string) {
  const noteRef = doc(db, 'stickyNotes', noteId);
  await deleteDoc(noteRef);
}
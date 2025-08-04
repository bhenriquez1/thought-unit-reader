// lib/noteService.ts
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';

export interface RightBrainNote {
  title: string;
  content: string;
  tags: string[];
  attachments: string[];
  bookId: string; // unique book identifier
  createdAt: Timestamp;
}

// Save note to Firestore
export async function saveNote(note: Omit<RightBrainNote, 'createdAt'>) {
  try {
    await addDoc(collection(db, 'notes'), {
      ...note,
      createdAt: Timestamp.now(),
    });
    console.log('✅ Note saved to Firestore');
  } catch (error) {
    console.error('❌ Error saving note:', error);
  }
}

// Get all notes for a specific book
export async function getNotesForBook(bookId: string) {
  try {
    const q = query(collection(db, 'notes'), where('bookId', '==', bookId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as RightBrainNote[];
  } catch (error) {
    console.error('❌ Error fetching notes:', error);
    return [];
  }
}
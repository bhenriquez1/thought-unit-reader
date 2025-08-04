// /lib/noteService.ts
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  Timestamp, 
  doc, 
  updateDoc 
} from 'firebase/firestore';

/**
 * Shape of a note used in RightBrainNoteEditor
 */
export interface RightBrainNote {
  id?: string; // Firestore doc ID
  title: string;
  content: string;
  tags: string[];
  attachments: string[];
  bookId: string; // unique book identifier
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/**
 * Save note to Firestore
 */
export async function saveNote(note: Omit<RightBrainNote, 'createdAt' | 'updatedAt' | 'id'>) {
  try {
    await addDoc(collection(db, 'notes'), {
      ...note,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log('✅ Note saved to Firestore', note);
  } catch (error) {
    console.error('❌ Error saving note:', error);
  }
}

/**
 * Update an existing note
 */
export async function updateNote(id: string, updates: Partial<RightBrainNote>) {
  try {
    const noteRef = doc(db, 'notes', id);
    await updateDoc(noteRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ Note ${id} updated`, updates);
  } catch (error) {
    console.error(`❌ Error updating note ${id}:`, error);
  }
}

/**
 * Get all notes for a specific book with safe type mapping
 */
export async function getNotesForBook(bookId: string): Promise<RightBrainNote[]> {
  try {
    const q = query(collection(db, 'notes'), where('bookId', '==', bookId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((docSnap) => {
      const data = docSnap.data();

      return {
        id: docSnap.id,
        title: (data.title as string) || '',
        content: (data.content as string) || '',
        tags: (data.tags as string[]) || [],
        attachments: (data.attachments as string[]) || [],
        bookId: (data.bookId as string) || '',
        createdAt: (data.createdAt as Timestamp) || null,
        updatedAt: (data.updatedAt as Timestamp) || null,
      } as RightBrainNote;
    });
  } catch (error) {
    console.error('❌ Error fetching notes:', error);
    return [];
  }
}
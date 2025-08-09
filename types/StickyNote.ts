// types/StickyNote.ts
export interface StickyNote {
  id?: string;
  content: string;
  page?: number;
  x?: number;
  y?: number;
  userId?: string;
  bookId?: string;
  createdAt?: unknown;  // Firestore Timestamp | Date
  updatedAt?: unknown;  // Firestore Timestamp | Date
}
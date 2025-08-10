// types/StickyNote.ts
// Unifies the various sticky note shapes used across the app while staying
// backward compatible with existing imports.

/** UI-centric note used in overlays/whiteboard (your original shape). */
export interface UIStickyNote {
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

/** Legacy page-based note used by StickyNoteService (Firestore "stickyNotes"). */
export interface PageStickyNote {
  id?: string;
  userId: string;
  fileId: string;       // service expects fileId
  pageNumber: number;   // service expects pageNumber
  content: string;
  childName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Lesson-scoped sticky note used by the Drawer (lessons/<lessonId>/stickyNotes). */
export interface LessonStickyNote {
  id: string;
  text: string;
  page?: number | null;
  userId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// ---------------------------------------------------------------------------
// Backwards-compatibility aliases
// ---------------------------------------------------------------------------
/** Keep existing imports working: `import { StickyNote } from '@/types/StickyNote'` */
export type StickyNote = UIStickyNote;
/** Helper alias when you want the service-compatible shape */
export type ServiceStickyNote = PageStickyNote;
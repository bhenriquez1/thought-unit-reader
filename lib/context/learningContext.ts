import { create } from "zustand";

// ── CurrentLearningContext ────────────────────────────────────────────────────
// Single source of truth for the document and page the user is currently
// studying. All stores that previously held their own copies of currentPage
// and documentId (annotationStore, surgeonEngineStore, pageContextStore,
// courseContextStore, focusCycleStore) should derive their values from here
// rather than maintaining independent copies.
//
// Phase 1: pages/index.tsx is the sole writer. SurgeonCockpit and other
// consumers read from this store directly.

export interface LearningContextState {
  /** IndexedDB document identifier for the currently-open PDF. Null when no document is open. */
  documentId: string | null;
  /** Book/content key used for page-text cache lookups — typically the PDF filename without extension. */
  bookId: string;
  /** 1-indexed current page number matching the PDF viewer. */
  currentPage: number;
  /** Total page count of the open PDF. 0 when no document is loaded. */
  totalPages: number;
}

interface LearningContextActions {
  setDocumentId: (id: string | null) => void;
  setBookId: (id: string) => void;
  setPage: (page: number) => void;
  setTotalPages: (n: number) => void;
}

export type CurrentLearningContext = LearningContextState & LearningContextActions;

export const useCurrentLearningContext = create<CurrentLearningContext>((set) => ({
  documentId: null,
  bookId: "default-book",
  currentPage: 1,
  totalPages: 0,

  setDocumentId: (id) => set({ documentId: id }),
  setBookId: (id) => set({ bookId: id }),
  setPage: (page) => set({ currentPage: page }),
  setTotalPages: (n) => set({ totalPages: n }),
}));

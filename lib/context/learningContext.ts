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
//
// Feature-local state (selection, highlights, Professor playback, Whiteboard
// grammar) intentionally does not live here. It may reference this identity,
// but it must never redefine which page is current.

// ── Teaching audience auto-detection ─────────────────────────────────────────
// Derives a teaching audience from the book title so components don't need
// a manual learner dropdown. Keyword list ordered most-specific first.
function detectAudienceFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/\bdat\b/.test(t)) return "dat";
  if (/board.?review|boards/.test(t)) return "board-review";
  if (/oral.?surg/.test(t)) return "oral-surgeon";
  if (/pediatric|child/.test(t)) return "child";
  if (/beginner|intro|basic/.test(t)) return "beginner";
  return "student";
}

export interface LearningContextState {
  /** IndexedDB document identifier for the currently-open PDF. Null when no document is open. */
  documentId: string | null;
  /** Book/content key used for page-text cache lookups — typically the PDF filename without extension. */
  bookId: string;
  /** Human-readable document title (PDF filename without extension). */
  documentTitle: string;
  /** 1-indexed current page number matching the PDF viewer. */
  currentPage: number;
  /** Total page count of the open PDF. 0 when no document is loaded. */
  totalPages: number;
  /**
   * Teaching audience auto-detected from the book title.
   * Maps to TeachingAudience values used by the Chief Resident API.
   * Updated automatically whenever documentTitle changes.
   */
  teachingAudience: string;
  /** ID of the thought unit currently anchored/active in the reader. */
  readerAnchor: string | null;
}

interface LearningContextActions {
  setDocumentId: (id: string | null) => void;
  setBookId: (id: string) => void;
  /** Sets the document title and re-derives teachingAudience from it. */
  setDocumentTitle: (title: string) => void;
  setPage: (page: number) => void;
  setTotalPages: (n: number) => void;
  setReaderAnchor: (anchor: string | null) => void;
}

export type CurrentLearningContext = LearningContextState & LearningContextActions;

export const useCurrentLearningContext = create<CurrentLearningContext>((set) => ({
  documentId: null,
  bookId: "default-book",
  documentTitle: "",
  currentPage: 1,
  totalPages: 0,
  teachingAudience: "student",
  readerAnchor: null,

  setDocumentId: (id) => set({ documentId: id }),
  setBookId: (id) => set({ bookId: id }),
  setDocumentTitle: (title) => set({ documentTitle: title, teachingAudience: detectAudienceFromTitle(title) }),
  setPage: (page) => set({ currentPage: page }),
  setTotalPages: (n) => set({ totalPages: n }),
  setReaderAnchor: (anchor) => set({ readerAnchor: anchor }),
}));

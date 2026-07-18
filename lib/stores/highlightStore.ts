// lib/stores/highlightStore.ts
// Persistent highlight state for PDF paragraph overlays.
// Two types:
//   pinned     — user-created, stays until manually cleared
//   activeFocus — driven by follow-scroll / card click, may change on scroll

import { create } from 'zustand';

export type HighlightType = 'pinned' | 'activeFocus';

export type Highlight = {
  paragraphId: string;
  type: HighlightType;
  color: string;
  pinned: boolean;
  createdAt: number;
  /** Bounding box relative to .react-pdf__Page, in pixels */
  bbox?: { top: number; left: number; width: number; height: number };
  /** The text snippet used for matching (first 80 chars) */
  textKey: string;
};

type PageHighlights = Record<string, Highlight>; // paragraphId → Highlight
type DocHighlights = Record<number, PageHighlights>; // pageIndex → PageHighlights

interface HighlightState {
  /** highlights[docId][pageIndex][paragraphId] */
  highlights: Record<string, DocHighlights>;

  /** Set a pinned highlight for a paragraph */
  setPinned: (
    docId: string,
    pageIndex: number,
    paragraphId: string,
    textKey: string,
    bbox?: Highlight['bbox'],
    color?: string,
  ) => void;

  /** Set or update the active-focus highlight (replaces previous active-focus on the page) */
  setActiveFocus: (
    docId: string,
    pageIndex: number,
    paragraphId: string,
    textKey: string,
    bbox?: Highlight['bbox'],
  ) => void;

  /** Toggle pinned: if already pinned, remove it. Returns true if pinned after toggle. */
  togglePinned: (
    docId: string,
    pageIndex: number,
    paragraphId: string,
    textKey: string,
    bbox?: Highlight['bbox'],
  ) => boolean;

  /** Remove a specific highlight */
  removeHighlight: (docId: string, pageIndex: number, paragraphId: string) => void;

  /** Clear all highlights on a page (called on page navigation) */
  clearPage: (docId: string, pageIndex: number) => void;

  /** Get all highlights for a given page */
  getPageHighlights: (docId: string, pageIndex: number) => PageHighlights;

  /** Check if a paragraph is pinned */
  isPinned: (docId: string, pageIndex: number, paragraphId: string) => boolean;
}

export const useHighlightStore = create<HighlightState>((set, get) => ({
  highlights: {},

  setPinned: (docId, pageIndex, paragraphId, textKey, bbox, color = 'teal') => {
    set((state) => {
      const docHL = { ...(state.highlights[docId] ?? {}) };
      const pageHL = { ...(docHL[pageIndex] ?? {}) };
      pageHL[paragraphId] = {
        paragraphId,
        type: 'pinned',
        color,
        pinned: true,
        createdAt: Date.now(),
        bbox,
        textKey,
      };
      docHL[pageIndex] = pageHL;
      return { highlights: { ...state.highlights, [docId]: docHL } };
    });
  },

  setActiveFocus: (docId, pageIndex, paragraphId, textKey, bbox) => {
    set((state) => {
      const docHL = { ...(state.highlights[docId] ?? {}) };
      const pageHL = { ...(docHL[pageIndex] ?? {}) };

      // Remove previous activeFocus highlights on this page (keep pinned ones)
      for (const [pid, hl] of Object.entries(pageHL)) {
        if (hl.type === 'activeFocus') delete pageHL[pid];
      }

      pageHL[paragraphId] = {
        paragraphId,
        type: 'activeFocus',
        color: 'teal',
        pinned: false,
        createdAt: Date.now(),
        bbox,
        textKey,
      };
      docHL[pageIndex] = pageHL;
      return { highlights: { ...state.highlights, [docId]: docHL } };
    });
  },

  togglePinned: (docId, pageIndex, paragraphId, textKey, bbox) => {
    const existing = get().highlights[docId]?.[pageIndex]?.[paragraphId];
    if (existing?.pinned) {
      get().removeHighlight(docId, pageIndex, paragraphId);
      return false;
    }
    get().setPinned(docId, pageIndex, paragraphId, textKey, bbox);
    return true;
  },

  removeHighlight: (docId, pageIndex, paragraphId) => {
    set((state) => {
      const docHL = { ...(state.highlights[docId] ?? {}) };
      const pageHL = { ...(docHL[pageIndex] ?? {}) };
      delete pageHL[paragraphId];
      docHL[pageIndex] = pageHL;
      return { highlights: { ...state.highlights, [docId]: docHL } };
    });
  },

  clearPage: (docId, pageIndex) => {
    set((state) => {
      const docHL = { ...(state.highlights[docId] ?? {}) };
      // Keep pinned highlights; clear activeFocus only
      const pageHL = { ...(docHL[pageIndex] ?? {}) };
      for (const [pid, hl] of Object.entries(pageHL)) {
        if (!hl.pinned) delete pageHL[pid];
      }
      docHL[pageIndex] = pageHL;
      return { highlights: { ...state.highlights, [docId]: docHL } };
    });
  },

  getPageHighlights: (docId, pageIndex) => {
    return get().highlights[docId]?.[pageIndex] ?? {};
  },

  isPinned: (docId, pageIndex, paragraphId) => {
    return get().highlights[docId]?.[pageIndex]?.[paragraphId]?.pinned === true;
  },
}));

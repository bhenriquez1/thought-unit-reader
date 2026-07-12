// lib/readingFocus/readingFocusStore.ts
// Single source of truth for all reading position and speech sync state.
// Every UI component (LeftPanel, PDF overlay, Expert Brain, Thought Units)
// subscribes here. There is only one Reading Focus Engine.

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReadingFocusState {
  /** Active thought-unit anchor ID — drives LeftPanel card highlight, PDF glow, Expert Brain. */
  thoughtUnitId: string | null;
  /** Verbatim sentence text currently being spoken — used by SmartPDFViewer to locate the word rect. */
  sentenceText: string | null;
  /** Index into the tokenized word list of the current sentence. */
  wordIndex: number;
  /** The surface word string at wordIndex (display form, not TTS-expanded). */
  word: string | null;
  /** Current speech playback state. */
  playbackState: 'idle' | 'playing' | 'paused' | 'loading';
  /** evidenceRefIds of anchors for which SmartPDFViewer has finished painting overlay rects.
   *  Written after setOverlayRects completes — an ID here means a rect is visible on screen. */
  pdfRenderedAnchorIds: string[];
  /** evidenceRefId of the anchor whose word-level rect (yellow box) is currently painted.
   *  Null when no word rect is visible (between segments, zooming, or after stop). */
  pdfRenderedWordAnchorId: string | null;
}

interface ReadingFocusActions {
  /** Set the active thought-unit anchor (LeftPanel click, PDF highlight click, or speech). */
  setThoughtUnit: (id: string | null) => void;
  /** Update live word-by-word position (fires on every karaoke tick). */
  setWord: (anchorId: string | null, wordIndex: number, word: string, sentenceText?: string) => void;
  /** Update speech playback state. */
  setPlaybackState: (state: ReadingFocusState['playbackState']) => void;
  /** Clear word-level sync without clearing the anchor focus (e.g. on speech stop). */
  clearWord: () => void;
  /** Clear all focus state (e.g. on page/book change). */
  clearFocus: () => void;
  /** Written by SmartPDFViewer after overlay rects finish painting. */
  setPdfRenderedAnchors: (ids: string[]) => void;
  /** Written by WordRectOverlay after the word-level rect is painted (or cleared). */
  setPdfRenderedWordAnchor: (id: string | null) => void;
}

type ReadingFocusStore = ReadingFocusState & ReadingFocusActions;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useReadingFocusStore = create<ReadingFocusStore>((set) => ({
  thoughtUnitId: null,
  sentenceText: null,
  wordIndex: 0,
  word: null,
  playbackState: 'idle',
  pdfRenderedAnchorIds: [],
  pdfRenderedWordAnchorId: null,

  setThoughtUnit: (id) => {
    console.log("[FOCUS_STORE_WRITE] setThoughtUnit", id);
    set({ thoughtUnitId: id });
  },

  setWord: (anchorId, wordIndex, word, sentenceText) => {
    if (anchorId) console.log("[FOCUS_STORE_WRITE] setWord anchorId", anchorId, "wordIdx", wordIndex);
    set((s) => ({
      thoughtUnitId: anchorId ?? s.thoughtUnitId,
      wordIndex,
      word,
      sentenceText: sentenceText ?? s.sentenceText,
    }));
  },

  setPlaybackState: (state) => set({ playbackState: state }),

  clearWord: () => set({ wordIndex: 0, word: null, sentenceText: null }),

  clearFocus: () => set({
    thoughtUnitId: null,
    sentenceText: null,
    wordIndex: 0,
    word: null,
    playbackState: 'idle',
  }),

  setPdfRenderedAnchors: (ids) => set({ pdfRenderedAnchorIds: ids }),

  setPdfRenderedWordAnchor: (id) => set({ pdfRenderedWordAnchorId: id }),
}));

// ── Compatibility selector ────────────────────────────────────────────────────

// Dev-only: expose store on window so Playwright stress tests can drive setWord()
// at word-tick rate without needing live TTS. Stripped in production by dead-code elimination.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__devReadingFocusStore = useReadingFocusStore;
}

/** Returns the active spoken-word object in the shape that SmartPDFViewer and
 *  ThoughtUnitNavigator expect. Returns null when nothing is playing. */
export function selectActiveSpokenWord(s: ReadingFocusState) {
  if (!s.word && !s.sentenceText) return null;
  return {
    anchorId: s.thoughtUnitId,
    wordIndex: s.wordIndex,
    word: s.word ?? '',
    sentenceText: s.sentenceText ?? undefined,
  };
}

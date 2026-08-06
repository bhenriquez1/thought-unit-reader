// lib/readingFocus/readingFocusStore.ts
// Single source of truth for all reading position and speech sync state.
// Every UI component (LeftPanel, PDF overlay, Expert Brain, Thought Units)
// subscribes here. There is only one Reading Focus Engine.

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shared cursor built on every PDF click and updated during playback.
 *  Drives seekToCursor in StudySpeechPanel and syncs LeftPanel/ExpertBrain. */
export interface ReadingCursor {
  /** Nearest resolved canonical anchor, or null for unanchored page text. */
  canonicalAnchorId: string | null;
  sourcePage: number;
  /** Verbatim text of the clicked span / sentence (used for text-range matching). */
  sourceText: string;
  /** Word index within sourceText (0-based). */
  sourceWordIndex: number;
  /** Character offset within the PDF span at click point. */
  sourceCharOffset: number;
}

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
  /** Most recent cursor built from a PDF word click. Null until the user clicks. */
  pdfClickCursor: ReadingCursor | null;
  /**
   * Set by SmartPDFViewer after every overlay rebuild — the two pipeline
   * stages AFTER quote grounding that previously had no signal outside a
   * console.log ([SURGEON_PIPELINE_DIAGNOSTIC]): a grounded quote can still
   * fail to locate in the live PDF text layer ("geometry_resolution"), or
   * resolve to geometry that the final dedup/render pass then drops
   * entirely ("render"). Null means the last rebuild had no targets to
   * resolve, or every target that had one made it all the way to a painted
   * rect — i.e. no problem at this stage. This is genuinely different from
   * useSurgeonAnnotations' own annotationFailureStage: that hook can report
   * "success" (the AI plan came back and grounded fine) while THIS still
   * reports a real failure, because it observes a layer useSurgeonAnnotations
   * has no visibility into at all (SmartPDFViewer's own PDF.js text-layer
   * coordinate matching).
   */
  annotationRenderStage: "geometry_resolution" | "render" | null;
  /** Raw counts backing annotationRenderStage — set together, always in sync.
   *  Lets the UI say "4 of 6 annotations could not be located on this page"
   *  instead of a binary pass/fail, since a PARTIAL geometry-resolution
   *  failure (some but not all grounded quotes fail to locate) sets
   *  annotationRenderStage to null (not every stage failed) but is still
   *  worth surfacing. Null together with annotationRenderStage. */
  annotationRenderCounts: { grounded: number; geometryResolved: number; rendered: number } | null;
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
  /** Written by SmartPDFViewer on every resolved PDF word click. */
  setPdfClickCursor: (cursor: ReadingCursor | null) => void;
  /** Written by SmartPDFViewer after every overlay rebuild — see annotationRenderStage. */
  setAnnotationRenderStage: (
    stage: ReadingFocusState['annotationRenderStage'],
    counts: ReadingFocusState['annotationRenderCounts'],
  ) => void;
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
  pdfClickCursor: null,
  annotationRenderStage: null,
  annotationRenderCounts: null,

  setThoughtUnit: (id) => {
    console.log("[FOCUS_STORE_WRITE] setThoughtUnit", id);
    set({ thoughtUnitId: id });
  },

  setWord: (anchorId, wordIndex, word, sentenceText) => {
    if (anchorId) console.log("[FOCUS_STORE_WRITE] setWord anchorId", anchorId, "wordIdx", wordIndex);
    set((s) => ({
      // Only update thoughtUnitId when the anchor actually changes — skipping same-anchor
      // word updates reduces re-renders from karaoke rate (4-30 Hz) to anchor boundaries.
      thoughtUnitId: (anchorId != null && anchorId !== s.thoughtUnitId) ? anchorId : s.thoughtUnitId,
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
    pdfClickCursor: null,
    annotationRenderStage: null,
    annotationRenderCounts: null,
  }),

  setPdfRenderedAnchors: (ids) => set({ pdfRenderedAnchorIds: ids }),

  setPdfRenderedWordAnchor: (id) => set({ pdfRenderedWordAnchorId: id }),

  setPdfClickCursor: (cursor) => set({ pdfClickCursor: cursor }),

  setAnnotationRenderStage: (stage, counts) => set({ annotationRenderStage: stage, annotationRenderCounts: counts }),
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

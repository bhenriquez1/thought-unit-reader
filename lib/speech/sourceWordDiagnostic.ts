// lib/speech/sourceWordDiagnostic.ts
// Correction (Current Mode losslessness): "Add a diagnostic assertion:
// sourceWordsExpected, sourceWordsQueued, sourceWordsCompleted,
// sourceWordsSkipped. sourceWordsSkipped should be 0 for a successfully
// completed Current reading."
//
// Pure word-count math only — no knowledge of PDF text, page-furniture
// stripping, or TTS. lib/speech/currentPageSpeech.ts computes the two input
// strings (the fully-filtered instructional reading sequence, i.e. AFTER
// legitimate furniture-only stripping and BEFORE sentence segmentation; and
// the sentence array actually queued for speech) and hands them here.
// "Expected" is deliberately scoped to the SELECTED reading sequence, not
// every raw word on the page — running headers/footers/page numbers are a
// legitimate exclusion made once, upstream, by design; what this diagnostic
// guards is that NOTHING is lost AFTER that selection is made.
//
// sourceWordsCompleted (live playback progress, incremented sentence-by-
// sentence as audio actually finishes) is a runtime/session concept that
// lives in components/reader/StudySpeechPanel.tsx instead — it requires a
// live playback session this pure module has no notion of, and can't be
// exercised by a jest test running in this repo's node environment.

export function countSourceWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export interface SourceWordDiagnostic {
  sourceWordsExpected: number;
  sourceWordsQueued: number;
  sourceWordsSkipped: number;
}

/**
 * Segmenting text into sentences should never change how many WORDS it
 * contains, only how they're grouped into array entries — sourceWordsSkipped
 * should always be 0 for a correctly-functioning segmenter. A positive value
 * means content was lost between "selected the reading sequence" and
 * "queued it to speak" — the exact regression this diagnostic exists to
 * catch.
 */
export function buildSourceWordDiagnostic(expectedText: string, queuedSegments: string[]): SourceWordDiagnostic {
  const sourceWordsExpected = countSourceWords(expectedText);
  const sourceWordsQueued = queuedSegments.reduce((sum, segment) => sum + countSourceWords(segment), 0);
  return {
    sourceWordsExpected,
    sourceWordsQueued,
    sourceWordsSkipped: Math.max(0, sourceWordsExpected - sourceWordsQueued),
  };
}

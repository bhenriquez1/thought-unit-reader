// lib/speech/speechSessionIdentity.ts
//
// Shared identity every speech cache entry, in-flight fetch, queued
// narration segment, and fallback utterance must be scoped to. Introduced by
// the Speech Engine audit's PR A (cache/identity stability) to fix two
// confirmed cross-page/cross-document audio bugs:
//
//   RC1: TldrawCanvas's narration cache was keyed by a bare segment.id
//   ("seg0", "seg1", ...) whose counter resets to 0 on every new lesson
//   build — page A's seg0 and page B's seg0 were literally the same cache
//   key, so navigating pages could silently play the wrong page's cached
//   audio.
//
//   RC2: StudySpeechPanel's audio-cache reset watched raw bookId (the
//   filename-derived key) instead of the real resolved documentId — two
//   different PDFs sharing a filename wouldn't flush the cache on switch,
//   reintroducing the identity-collision class lib/insights/
//   resolveDocumentIdentity.ts was built to fix elsewhere.
//
// Every owner that caches or fetches speech now builds its keys from a
// SpeechSessionIdentity, so a genuinely different page/document/lesson can
// never collide with another even if a caller-local id (segment id, voice+
// text pair) happens to match.

import type { SpeechOwner } from "./speechController";

export interface SpeechSessionIdentity {
  documentId: string;
  pageNumber: number;
  pageTruthKey: string;
  owner: SpeechOwner;
  /** Distinguishes independently-regenerated content for the SAME page —
   *  e.g. TldrawCanvas's lesson plan carries its own VSG content hash
   *  (sourceSnapshot.vsgId), so a "reanalyze" that produces a new lesson for
   *  the same page also gets a fresh cache namespace. Omitted by owners with
   *  no such finer-grained concept (StudySpeechPanel). */
  lessonId?: string;
}

/** Collapses a full identity into one string — every field folded in, none
 *  silently ignored, so two identities that differ in ANY field never
 *  collide. */
export function buildSpeechSessionKey(identity: SpeechSessionIdentity): string {
  const { owner, documentId, pageNumber, pageTruthKey, lessonId } = identity;
  return `${owner}::${documentId}::${pageNumber}::${pageTruthKey}::${lessonId ?? ""}`;
}

/** Qualifies a caller-local id (a narration segment id, a `${voice}::${text}`
 *  audio key, ...) with the full session identity, so two different sessions
 *  can never collide in a shared Map even when their local ids match. */
export function buildSpeechCacheKey(identity: SpeechSessionIdentity, localId: string): string {
  return `${buildSpeechSessionKey(identity)}::${localId}`;
}

export function speechSessionIdentitiesEqual(
  a: SpeechSessionIdentity | null | undefined,
  b: SpeechSessionIdentity | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return buildSpeechSessionKey(a) === buildSpeechSessionKey(b);
}

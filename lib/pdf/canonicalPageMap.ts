// lib/pdf/canonicalPageMap.ts
// Stabilization item 4C-1 — Canonical Page Map foundation. Additive
// infrastructure only: nothing in the app reads from this yet. No existing
// consumer (Highlight/groundSurgeonQuotes.ts, eye-follow/resolveWordGeometry,
// Current Page speech, Professor source-reading) is touched by this file.
//
// The problem this sets up to fix (later phases, not this one): Highlight,
// eye-follow, and Professor source-reading each currently derive "what
// sentence is this" independently, from text that isn't always the SAME
// reconstruction (a live survey confirmed eye-follow's TextLayerRegistry
// fullText — buildPageTextIndex's flat single-space join — is NOT
// byte-identical to the buildStructuredPageText/buildColumnFull output
// Highlight and Current Page speech already share). A CanonicalPageMap is
// the one shared, stable enumeration all of them can eventually reference
// instead of re-deriving their own.
//
// This file builds that enumeration from the SAME canonical pageText
// Highlight/Speech already use (buildStructuredPageText's output — the
// caller passes it in; this module never reconstructs page text itself),
// using the SAME sentence-boundary algorithm segmentPageSentences.ts already
// uses and ships tested (findSentenceSpans), extended two ways:
//   1. Retains EVERY span, tagged with a RegionRole — segmentPageSentences
//      SKIPS non-body/implausible spans for its narrower "candidate list to
//      show an LLM" purpose; a canonical map needs every span accounted
//      for, so a future Coverage Auditor can say "this sentence is a figure
//      caption, correctly not highlighted" instead of the sentence simply
//      vanishing with no explanation.
//   2. Carries exact char offsets into the canonical pageText, not just
//      text — segmentPageSentences only needs exact-substring lookup by id,
//      not composable offsets.

import { findSentenceSpans } from "../insights/segmentPageSentences";
import { classifyLineRole, type RegionRole } from "../insights/cleanActivePageText";

export type { RegionRole };

export interface CanonicalSentence {
  /** Stable within one CanonicalPageMap build: "S001", "S002", ... in
   *  reading order — same format segmentPageSentences already uses, so a
   *  later migration (item 4C-3) doesn't also have to change id shape. */
  id: string;
  pageIndex: number;
  /** Exact substring of the CanonicalPageMap's own `fullText`:
   *  fullText.slice(charStart, charEnd) === text always holds. */
  text: string;
  charStart: number;
  charEnd: number;
  regionRole: RegionRole;
}

export interface CanonicalPageMap {
  pageIndex: number;
  /** Bumped whenever the segmentation/classification algorithm changes, so
   *  a cached map built under an older version can be detected and rebuilt
   *  rather than silently trusted. Not a content hash — two different pages
   *  built under the same algorithm share the same structureVersion. */
  structureVersion: string;
  /** The exact canonical pageText this map was built from (verbatim
   *  reference) — every sentence's charStart/charEnd is an offset into
   *  THIS string, not into any other page-text reconstruction. */
  fullText: string;
  sentences: CanonicalSentence[];
}

/** Bump when findSentenceSpans/classifyLineRole's behavior changes in a way
 *  that would change a page's sentence boundaries or region roles. */
export const CANONICAL_PAGE_MAP_VERSION = "1";

/** Defensive cap, mirroring segmentPageSentences' own — a pathological page
 *  still produces a boundedly-sized map instead of one that grows without
 *  limit. Generous relative to segmentPageSentences' 80 candidate cap since
 *  this retains EVERY span (furniture included), not just LLM-shown ones. */
const MAX_CANONICAL_SENTENCES = 400;

/**
 * Builds a CanonicalPageMap from the same canonical pageText Highlight and
 * Current Page speech already use. Pure function: same pageText always
 * produces the same map (same ids, same offsets, same roles) — safe to call
 * repeatedly, and safe to cache keyed only on pageIndex (see
 * CanonicalPageMapRegistry below) as long as structureVersion is checked.
 */
export function buildCanonicalPageMap(pageIndex: number, pageText: string): CanonicalPageMap {
  const sentences: CanonicalSentence[] = [];
  const spans = findSentenceSpans(pageText).slice(0, MAX_CANONICAL_SENTENCES);

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    sentences.push({
      id: `S${String(i + 1).padStart(3, "0")}`,
      pageIndex,
      text: span.text,
      charStart: span.start,
      charEnd: span.end,
      regionRole: classifyLineRole(span.text),
    });
  }

  return {
    pageIndex,
    structureVersion: CANONICAL_PAGE_MAP_VERSION,
    fullText: pageText,
    sentences,
  };
}

// ── Registry ─────────────────────────────────────────────────────────────
// Mirrors TextLayerRegistry/PageBridgeRegistry's epoch-guarded Map exactly
// (see pageBridgeRegistry.ts's header comment for the cross-document race
// this closes) — a late write from a superseded document extraction, still
// stamped with its own now-stale epoch, is silently dropped instead of
// contaminating the registry a newer extraction is actively populating.
const canonicalPageMapRegistry = new Map<number, CanonicalPageMap>();
let epoch = 0;

export const CanonicalPageMapRegistry = {
  /** forEpoch, when passed, must match the CURRENT epoch or this write is
   *  silently dropped — see PageBridgeRegistry.set()'s doc comment for the
   *  race this closes. Omitting it skips the check. */
  set(map: CanonicalPageMap, forEpoch?: number): void {
    if (forEpoch !== undefined && forEpoch !== epoch) return;
    canonicalPageMapRegistry.set(map.pageIndex, map);
  },

  get(pageIndex: number): CanonicalPageMap | undefined {
    return canonicalPageMapRegistry.get(pageIndex);
  },

  /** Clears all entries and starts a new epoch — see set()'s doc comment.
   *  Returns the new epoch for the caller to stamp its own set() calls with. */
  clear(): number {
    canonicalPageMapRegistry.clear();
    epoch += 1;
    return epoch;
  },

  currentEpoch(): number {
    return epoch;
  },
};

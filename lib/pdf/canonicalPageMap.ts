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
//
// Types and the registry itself live in canonicalPageMapRegistry.ts (split
// out for item 4C-3) — re-exported here so existing imports of this file
// (pdfjs-handler.ts, tests) keep working unchanged.

import { findSentenceSpans } from "../insights/segmentPageSentences";
import { classifyLineRole } from "../insights/cleanActivePageText";
import {
  CanonicalPageMapRegistry,
  type CanonicalSentence,
  type CanonicalPageMap,
  type RegionRole,
} from "./canonicalPageMapRegistry";

export { CanonicalPageMapRegistry };
export type { CanonicalSentence, CanonicalPageMap, RegionRole };

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

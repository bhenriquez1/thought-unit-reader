// lib/pdf/canonicalPageMapRegistry.ts
// Types + the registry itself, split out of canonicalPageMap.ts so that
// lib/insights/segmentPageSentences.ts (stabilization item 4C-3) can read
// the registry without an import cycle: canonicalPageMap.ts's OWN builder
// function (buildCanonicalPageMap) needs segmentPageSentences.ts's
// findSentenceSpans, so segmentPageSentences.ts cannot import
// canonicalPageMap.ts back without creating one. This file has no
// dependency on either, so both can depend on it safely.

import type { RegionRole } from "../insights/cleanActivePageText";

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

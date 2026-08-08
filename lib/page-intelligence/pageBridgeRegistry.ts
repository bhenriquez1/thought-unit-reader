// lib/page-intelligence/pageBridgeRegistry.ts
// Stores per-page StructuredPageBridge objects produced by buildStructuredPageTextFull().
// Cleared at the start of each document extraction to prevent stale cross-document entries.
//
// Keyed only by pageIndex (no documentId component) — correctness previously
// depended entirely on .clear() always running before a new extraction's
// .set() calls and never running again until that extraction finished. A
// rapid document switch mid-extraction breaks that assumption: extraction A
// (document X) is still awaiting an in-flight page's async work when the
// user switches documents; extraction B (document Y) calls .clear() and
// starts writing; A's late page-write then lands in B's now-active
// registry under whatever pageIndex A was working on — silent
// cross-document contamination, the deepest point in the whole pipeline it
// could originate. The epoch counter below closes that: every set() call is
// stamped with the epoch it was minted under (captured once, synchronously,
// right after this extraction's own clear()); a write whose epoch no longer
// matches the CURRENT epoch (i.e. a newer clear() has since run) is a write
// from a superseded extraction and is dropped instead of applied.

import type { StructuredPageBridge } from "../pdf/structuredPageText";

const bridgeRegistry = new Map<number, StructuredPageBridge>();
let epoch = 0;

export const PageBridgeRegistry = {
  /** forEpoch, when passed, must match the CURRENT epoch (the value
   *  returned by the most recent clear()) or this write is silently
   *  dropped — a late write from a document extraction a newer one has
   *  since superseded. Omitting forEpoch skips the check (existing/test
   *  callers that don't track an epoch behave exactly as before). */
  set(pageIndex: number, bridge: StructuredPageBridge, forEpoch?: number): void {
    if (forEpoch !== undefined && forEpoch !== epoch) return;
    bridgeRegistry.set(pageIndex, bridge);
  },

  get(pageIndex: number): StructuredPageBridge | undefined {
    return bridgeRegistry.get(pageIndex);
  },

  /** Clears all entries and starts a new epoch. Returns the new epoch —
   *  callers starting an extraction should capture this once and pass it to
   *  every set() call made during that same extraction. */
  clear(): number {
    bridgeRegistry.clear();
    epoch += 1;
    return epoch;
  },

  /** Current epoch, for callers that need to check staleness without
   *  triggering a clear (e.g. a diagnostic or a test). */
  currentEpoch(): number {
    return epoch;
  },
};

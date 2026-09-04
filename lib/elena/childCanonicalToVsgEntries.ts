// lib/elena/childCanonicalToVsgEntries.ts
// L19 — converts Elena's own per-page CanonicalThoughtUnits (lib/elena/
// childCanonicalExtraction.ts's lightweight, non-AI chunker output) into the
// CanonicalEntryInput[] shape the Whiteboard's Scene Builder consumes,
// mirroring surgeonAnnotationsToCanonicalEntries's role for the adult
// Reader's AI-driven Surgeon Annotation Plan. Reuses selectTeachingUnits
// (lib/elena/childTeachingAdapter.ts) so the Whiteboard, elena-buddy, and
// elena-vocab all rank/cap the same page's units the same way.

import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import type { CanonicalEntryInput } from "@/lib/whiteboard/canonicalRelationshipGraph";
import { selectTeachingUnits } from "@/lib/elena/childTeachingAdapter";

const DEFAULT_MAX_ENTRIES = 6;

// CanonicalThoughtUnit has no priorityTier field (that vocabulary belongs to
// the Surgeon/NoteCard adapters) — only a 0-1 importanceScore/datRelevance.
// Bucketed against the same tier semantics resolveImportanceLevel() uses
// (lib/reader/importanceBadge.ts): tier>=5 critical, >=4 high, >=3 medium,
// <3 reference.
function priorityTierFromScore(score: number | undefined): number | undefined {
  if (score === undefined) return undefined;
  if (score >= 0.8) return 5;
  if (score >= 0.6) return 4;
  if (score >= 0.4) return 3;
  return 2;
}

/** Pure — highest-importance units first, capped, converted to the VSG's
 *  entry shape. `unit.canonicalType` (CanonicalSemanticType) already shares
 *  its string vocabulary with CanonicalEntryInput.canonicalType — no mapping
 *  table needed, unlike the NoteCard adapter's type-string translation. */
export function childCanonicalUnitsToVsgEntries(
  units: CanonicalThoughtUnit[],
  maxEntries: number = DEFAULT_MAX_ENTRIES,
): CanonicalEntryInput[] {
  return selectTeachingUnits(units, maxEntries).map((unit) => ({
    id: unit.id,
    text: unit.text,
    canonicalType: unit.canonicalType,
    priorityTier: priorityTierFromScore(unit.importanceScore ?? unit.datRelevance),
    page: unit.pageIndex + 1,
  }));
}

// lib/elena/childTeachingAdapter.ts
// E3 — replaces elena-buddy.ts/elena-vocab.ts's raw-pageText grounding with
// real CanonicalThoughtUnits, ranked by the same importance/relevance
// signal the rest of the app already computes for a page (semanticScoring's
// importanceScore, falling back to datRelevance). Elena does not re-derive
// or reinterpret page content here — she reads the SAME canonical records
// every other product consumes.

import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import { getCanonicalUnitsByPage } from "@/lib/canonical/store";

const DEFAULT_MAX_UNITS = 6;

/** Pure — highest-importance units first. */
export function selectTeachingUnits(
  units: CanonicalThoughtUnit[],
  maxUnits: number = DEFAULT_MAX_UNITS,
): CanonicalThoughtUnit[] {
  return [...units]
    .sort((a, b) => (b.importanceScore ?? b.datRelevance ?? 0) - (a.importanceScore ?? a.datRelevance ?? 0))
    .slice(0, maxUnits);
}

/** Pure — joins the selected units' text into a single grounded context
 *  block, in the same shape elena-buddy/elena-vocab already inject into
 *  <page_content> tags (see buildContextMessages/buildMessages). */
export function buildGroundedPageContext(
  units: CanonicalThoughtUnit[],
  maxUnits: number = DEFAULT_MAX_UNITS,
): string {
  return selectTeachingUnits(units, maxUnits).map((u) => u.text).join("\n\n");
}

/**
 * Loads this page's CanonicalThoughtUnits and builds grounded context text.
 * Returns null (not an error) when no units exist yet for this page — the
 * caller falls back to raw pageText, since extraction is best-effort and
 * asynchronous (lib/elena/childCanonicalExtraction.ts) and may not have
 * completed for a page the child just turned to.
 */
export async function loadGroundedPageContext(
  documentId: string,
  pageNumber: number,
): Promise<string | null> {
  try {
    const units = await getCanonicalUnitsByPage(documentId, pageNumber - 1);
    if (units.length === 0) return null;
    return buildGroundedPageContext(units) || null;
  } catch {
    return null;
  }
}

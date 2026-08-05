// lib/insights/annotationPlanCache.ts
// Version-keyed cache for SurgeonAnnotationPlan.
//
// The cache key includes all factors that change the interpretation of a page:
//   - bookId + pageIndex (which page)
//   - structureVersion (bump when paragraph grouping algorithm changes)
//   - paragraphAlgorithmVersion (bump when text-extraction / chunking logic changes)
//   - semanticPackVersion (bump when semantic pack type mappings change)
//   - modelVersion (bump when the OpenAI prompt/schema itself changes)
//
// When ANY value changes, the cached plan is treated as stale and must be
// regenerated — this is the mechanism behind the "stored annotation version is
// outdated" trigger rule: a version bump alone makes old cache entries miss
// cleanly, no migration needed. pageTruthKey (documentId::pageNumber::t) is
// embedded in the plan itself; callers should verify it matches before using a
// cached plan.

// ── Version constants ─────────────────────────────────────────────────────────
// Increment the relevant constant whenever the corresponding algorithm changes.

/** Bump when annotation structure grouping logic changes. */
export const STRUCTURE_VERSION = 1;

/** Bump when paragraph extraction / text-chunking logic changes. */
export const PARAGRAPH_ALGORITHM_VERSION = 1;

/** Bump when semantic pack type taxonomy changes (new kinds, renamed kinds). */
export const SEMANTIC_PACK_VERSION = 1;

/** Bump when the SurgeonAnnotationPlan prompt or output schema changes — a
 *  cached plan generated under an older prompt/schema must never be reused.
 *  v2: added required pageRole + optional relationship fields, density-limiting
 *  guidance, and the comparisonBracket/trapNotch/evidenceUnderline visual
 *  redesign — a v1-cached plan lacks pageRole and would fail schema validation.
 *  v3: request now sends structured typed blocks[] instead of a flat text
 *  slice, and the prompt explicitly forbids quoting from neighboring-page
 *  headings — a v2-cached plan is schema-compatible but was generated without
 *  these stricter current-page-only grounding instructions, so it's treated
 *  as stale rather than silently reused.
 *  v4: pageRole is now the shared page CLASSIFIER — expanded from 5 generic
 *  values to a domain-flavored taxonomy (anatomy/physiology/pharmacology/
 *  diagnosis/histology/classification/decision-tree/workflow/mathematical-
 *  derivation/organic-chemistry-reaction, plus the original 5 as a fallback),
 *  and the prompt now adapts which canonicalTypes it favors per pageRole — a
 *  v3-cached plan's pageRole was chosen under the old narrow taxonomy and its
 *  category selection wasn't adaptive, so it's treated as stale. This same
 *  pageRole value is also what the Whiteboard now uses to pick its teaching
 *  grammar (lib/whiteboard/buildProfessorLessonInput.ts).
 *  v5: explicit 5-8 annotation density TARGET (not just a ceiling) with a
 *  warning against under-annotating a dense page, and the model/endpoint
 *  now resolves its OpenAI model dynamically via resolveOpenAIModel.ts
 *  instead of a hardcoded "gpt-4o" — a v4-cached plan was generated under
 *  the old, looser density guidance. */
export const MODEL_VERSION = 5;

// ── Cache key builder ─────────────────────────────────────────────────────────

export interface AnnotationCacheKeyParams {
  bookId: string;
  pageIndex: number;
  semanticPackId?: string;
}

/**
 * Build a stable cache key for a SurgeonAnnotationPlan.
 *
 * Format: `aplan:v<sv>-<pv>-<spv>-<mv>:<bookId>:p<pageIndex>[:<packId>]`
 *
 * sv = STRUCTURE_VERSION, pv = PARAGRAPH_ALGORITHM_VERSION,
 * spv = SEMANTIC_PACK_VERSION, mv = MODEL_VERSION
 */
export function buildAnnotationCacheKey(params: AnnotationCacheKeyParams): string {
  const { bookId, pageIndex, semanticPackId } = params;
  const versionTag = `v${STRUCTURE_VERSION}-${PARAGRAPH_ALGORITHM_VERSION}-${SEMANTIC_PACK_VERSION}-${MODEL_VERSION}`;
  const packSuffix = semanticPackId ? `:${semanticPackId}` : "";
  return `aplan:${versionTag}:${bookId}:p${pageIndex}${packSuffix}`;
}

/**
 * Check whether a cached plan's pageTruthKey still matches the current page.
 * Returns true only when both the cache key is current AND the plan's embedded
 * pageTruthKey matches the live value.
 */
export function isAnnotationPlanFresh(params: {
  cachedPlanPtk: string;
  currentPageTruthKey: string;
  cachedCacheKey: string;
  currentCacheKey: string;
}): boolean {
  const { cachedPlanPtk, currentPageTruthKey, cachedCacheKey, currentCacheKey } = params;
  return cachedCacheKey === currentCacheKey && cachedPlanPtk === currentPageTruthKey;
}

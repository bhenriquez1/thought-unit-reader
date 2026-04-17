// lib/insights/dedupeSectionCandidates.ts
// Semantic similarity utilities for right-panel field deduplication.
// Prevents Core Idea / Pattern / Reason / Trap / Rule from repeating each other.

// ---------------------------------------------------------------------------
// Universal discourse-role signals (not domain-specific)
// ---------------------------------------------------------------------------

export const PATTERN_RE = /\b(defines?|is defined|describes?|consists? of|refers? to|is made of|occurs? when|depends on|includes?|can be grouped|comprises?|is characterized|represents?|classified as|known as|called|composed of|made up of|formed by|constitutes?)\b/i;

export const REASON_RE  = /\b(because|therefore|thus|results? in|leads? to|allows?|explains?|helps?|causes?|enables?|drives?|underlies?|involves?|due to|so that|in order to|responsible for|accounts? for|attributed to)\b/i;

export const TRAP_RE    = /\b(however|but|although|whereas|unlike|in contrast|rather than|except|not |can be confused|should not be confused|do not|does not|is not|are not|conversely|instead|the difference|different from|distinct from|must not|incorrectly|often mistaken)\b/i;

export const RULE_RE    = /\b(key takeaway|therefore|in other words|thus|the main point|should be understood|can be treated|remember|note that|importantly|always|never|must|the rule is|key rule|general rule|takeaway|it follows that)\b/i;

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 4);
}

export function semanticOverlap(a: string, b: string): number {
  const wa = new Set(normalizeWords(a));
  const wb = new Set(normalizeWords(b));
  if (!wa.size || !wb.size) return 0;
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return intersection / union;
}

export function isTooSimilar(candidate: string, usedLines: string[], threshold = 0.42): boolean {
  const nc = candidate.toLowerCase().trim();
  for (const used of usedLines) {
    const nu = used.toLowerCase().trim();
    if (nc === nu) return true;
    // Containment: one is a substring of the other (> 40 chars overlap)
    if (nc.length > 40 && nu.length > 40 && (nc.includes(nu.slice(0, 60)) || nu.includes(nc.slice(0, 60)))) return true;
    if (semanticOverlap(candidate, used) >= threshold) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Role-scored candidate picker
// ---------------------------------------------------------------------------

export type SectionRole = "pattern" | "reason" | "trap" | "rule";

function roleScore(text: string, role: SectionRole): number {
  switch (role) {
    case "pattern": return PATTERN_RE.test(text) ? 3 : 0;
    case "reason":  return REASON_RE.test(text)  ? 3 : 0;
    case "trap":    return TRAP_RE.test(text)    ? 4 : 0;
    case "rule":    return RULE_RE.test(text)    ? 3 : 0;
  }
}

/**
 * From a pool of candidates, pick the first sentence that:
 * - passes `isRenderableSentence`
 * - is NOT too similar to already-used lines
 * - optionally scores well for the target role
 */
export function selectDistinctForRole(
  candidates: string[],
  usedLines: string[],
  role: SectionRole,
  isRenderable: (s: string) => boolean,
  fallback: string
): string {
  // Sort candidates: role-matching first, then by length
  const scored = candidates
    .filter((c) => c && isRenderable(c))
    .map((c) => ({ c, s: roleScore(c, role) }))
    .sort((a, b) => b.s - a.s || b.c.length - a.c.length);

  for (const { c } of scored) {
    if (!isTooSimilar(c, usedLines)) return c;
  }
  return fallback;
}

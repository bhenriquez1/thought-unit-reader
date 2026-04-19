// lib/insights/dedupeSectionCandidates.ts
// Semantic similarity utilities for right-panel field deduplication.
// Prevents Core Idea / Pattern / Reason / Trap / Rule from repeating each other.

import { isRenderableSentence } from "./isRenderableSentence";

// ---------------------------------------------------------------------------
// Universal discourse-role signals (not domain-specific)
// ---------------------------------------------------------------------------

export const PATTERN_RE = /\b(defines?|is defined|describes?|consists? of|refers? to|is made of|occurs? when|depends on|includes?|can be grouped|comprises?|is characterized|represents?|classified as|known as|called|composed of|made up of|formed by|constitutes?)\b/i;

export const REASON_RE  = /\b(because|therefore|thus|results? in|leads? to|allows?|explains?|helps?|causes?|enables?|drives?|underlies?|involves?|due to|so that|in order to|responsible for|accounts? for|attributed to)\b/i;

export const TRAP_RE    = /\b(whereas|unlike|in contrast|rather than|the difference|different from|distinct from|conversely|instead|can be confused|should not be confused|do not confuse|does not|is not|are not|must not|incorrectly|often mistaken|commonly confused|not to be confused)\b/i;

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

// ---------------------------------------------------------------------------
// Formal section API — batch dedup across all 6 section kinds
// ---------------------------------------------------------------------------

export type SectionKind =
  | "coreIdea" | "pattern" | "reason" | "trap" | "rule" | "compression";

export interface SectionCandidate {
  id: string;
  text: string;
  kind: SectionKind;
  score: number;
  sourceSentenceIds?: string[];
}

export interface DedupeSectionResult {
  selected: Partial<Record<SectionKind, SectionCandidate>>;
  compression: SectionCandidate[];
  rejected: SectionCandidate[];
}

const SECTION_ORDER: Exclude<SectionKind, "compression">[] = [
  "coreIdea", "pattern", "reason", "trap", "rule",
];

function kindBonus(text: string, kind: SectionKind): number {
  switch (kind) {
    case "coreIdea":    return 0;
    case "pattern":     return PATTERN_RE.test(text) ? 4 : 0;
    case "reason":      return REASON_RE.test(text)  ? 4 : 0;
    case "trap":        return TRAP_RE.test(text)    ? 5 : 0;
    case "rule":        return RULE_RE.test(text)    ? 4 : 0;
    case "compression": return (RULE_RE.test(text) ? 3 : 0) + (text.length >= 60 ? 1 : 0);
  }
}

export function dedupeSections(
  candidates: SectionCandidate[],
  coreIdea: string
): DedupeSectionResult {
  const selected: Partial<Record<SectionKind, SectionCandidate>> = {};
  const compression: SectionCandidate[] = [];
  const rejected: SectionCandidate[] = [];

  const usedTexts: string[] = coreIdea ? [coreIdea] : [];

  const scored = candidates.map((c) => ({
    ...c,
    effectiveScore: c.score + kindBonus(c.text, c.kind),
  }));

  for (const kind of SECTION_ORDER) {
    const pool = scored
      .filter((c) => c.kind === kind)
      .sort((a, b) => b.effectiveScore - a.effectiveScore);

    for (const c of pool) {
      if (!isRenderableSentence(c.text)) { rejected.push(c); continue; }
      if (isTooSimilar(c.text, usedTexts)) { rejected.push(c); continue; }
      selected[kind] = c;
      usedTexts.push(c.text);
      break;
    }
  }

  // COMPRESSION — up to 3 distinct rule-quality lines, distinct from all selected
  const compressionUsed: string[] = [coreIdea];
  for (const v of Object.values(selected)) {
    if (v) compressionUsed.push(v.text);
  }

  const compressionPool = scored
    .filter((c) => c.kind === "compression")
    .sort((a, b) => b.effectiveScore - a.effectiveScore);

  for (const c of compressionPool) {
    if (compression.length >= 3) break;
    if (!isRenderableSentence(c.text)) { rejected.push(c); continue; }
    if (isTooSimilar(c.text, compressionUsed)) { rejected.push(c); continue; }
    compression.push(c);
    compressionUsed.push(c.text);
  }

  return { selected, compression, rejected };
}

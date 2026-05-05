// lib/highlights/buildHighlightNeighborhoods.ts
// Groups concept-derived highlights into coherent page-side idea clusters.
//
// Each neighborhood contains one anchor sentence that orients the concept,
// followed by local support/additional/trap sentences from the same paragraph
// neighborhood. This is the structure that makes the left page feel understandable
// in 1–2 minutes rather than a list of ranked isolated lines.
//
// LEFT PANEL reading path per neighborhood:
//   anchor → support → additional → trap

import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import { ROLE_PRIORITY } from "@/lib/insights/extractConceptBlocks";
import type { ConceptBlockInput, ConceptRole } from "@/lib/insights/extractConceptBlocks";
import { REASON_RE, TRAP_RE, isTooSimilar } from "@/lib/insights/dedupeSectionCandidates";

// Math path: examples are promoted before measurements/rules so worked examples
// appear at step 3 (after definition → meaning), not buried after quantitative rules.
const MATH_ROLE_PRIORITY: Record<ConceptRole, number> = {
  definition:  6,
  mechanism:   5,
  example:     4,
  measurement: 3,
  variation:   2,
  detail:      1,
};

export type HighlightTier = "important" | "support" | "additional" | "trap";

export interface HighlightLine {
  id: string;
  text: string;
  normalizedText: string;
  sentenceId?: string;
  tier: HighlightTier;
  score: number;
}

export interface HighlightNeighborhood {
  id: string;
  conceptId: string;
  title: string;
  anchor: HighlightLine;
  support: HighlightLine[];    // 1–2 local explanation sentences (REASON_RE preferred)
  additional: HighlightLine[]; // 0–1 distinct secondary detail
  trap: HighlightLine | null;  // 0–1 genuine contrast/confusion sentence
  priorityScore: number;
  conceptRole?: ConceptRole;   // structural role (definition / mechanism / variation …)
  depthLevel: "full" | "partial" | "anchor_only";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u00ad/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeLine(
  id: string,
  rawText: string,
  tier: HighlightTier,
  score: number,
  sentenceId?: string
): HighlightLine | null {
  const text = cleanSentence(rawText);
  if (!isRenderableSentence(text)) return null;
  return { id, text, normalizedText: normalize(text), sentenceId, tier, score };
}

/**
 * Converts concept blocks into structured highlight neighborhoods.
 *
 * Global dedup (`seenTexts`) prevents the same sentence appearing in two
 * neighborhoods. Per-neighborhood dedup ensures support/additional are distinct
 * from the anchor and each other.
 */
export function buildHighlightNeighborhoods(
  concepts: ConceptBlockInput[],
  options?: { pageKind?: string }
): HighlightNeighborhood[] {
  const neighborhoods: HighlightNeighborhood[] = [];
  const seenTexts = new Set<string>(); // global across all neighborhoods

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];

    // ── ANCHOR ────────────────────────────────────────────────────────────────
    const anchorLine = makeLine(
      `important-${concept.id}`,
      concept.anchorSentence,
      "important",
      Math.min(1, 0.92 - i * 0.07),
      concept.anchorSentenceId
    );
    if (!anchorLine) continue;
    if (seenTexts.has(anchorLine.normalizedText)) continue;
    seenTexts.add(anchorLine.normalizedText);

    // ── SUPPORT ───────────────────────────────────────────────────────────────
    // Support must be local (same concept neighborhood) and explanatory.
    // Primary: prefer REASON_RE signal; fall back to first available sentence.
    // Secondary: only add a second support if it also carries REASON_RE signal.
    const support: HighlightLine[] = [];
    const neighborhoodUsed: string[] = [anchorLine.text]; // for within-neighborhood dedup

    const reasonSentence = concept.supportSentences.find((s) => REASON_RE.test(s));
    const primarySupportRaw = reasonSentence ?? concept.supportSentences[0];

    if (primarySupportRaw) {
      const idx = concept.supportSentences.indexOf(primarySupportRaw);
      const line = makeLine(
        `support-${concept.id}-0`,
        primarySupportRaw,
        "support",
        0.78,
        concept.supportSentenceIds[idx] ?? concept.supportSentenceIds[0]
      );
      if (line && !seenTexts.has(line.normalizedText)) {
        seenTexts.add(line.normalizedText);
        neighborhoodUsed.push(line.text);
        support.push(line);
      }
    }

    // Second support: only when a genuine REASON signal exists distinct from primary
    if (support.length > 0) {
      const secondSupportRaw = concept.supportSentences.find(
        (s) => s !== primarySupportRaw && REASON_RE.test(s) && !TRAP_RE.test(s)
      );
      if (secondSupportRaw) {
        const idx = concept.supportSentences.indexOf(secondSupportRaw);
        const line = makeLine(
          `support-${concept.id}-1`,
          secondSupportRaw,
          "support",
          0.68,
          concept.supportSentenceIds[idx]
        );
        if (line && !seenTexts.has(line.normalizedText) && !isTooSimilar(line.text, neighborhoodUsed)) {
          seenTexts.add(line.normalizedText);
          neighborhoodUsed.push(line.text);
          support.push(line);
        }
      }
    }

    // ── ADDITIONAL ────────────────────────────────────────────────────────────
    // Optional secondary detail — only when meaningfully distinct from anchor + support.
    const additional: HighlightLine[] = [];

    const additionalRaw = concept.supportSentences.find((s) => {
      if (s === primarySupportRaw) return false;
      if (support.some((sup) => sup.text === cleanSentence(s))) return false;
      if (TRAP_RE.test(s)) return false;
      const t = cleanSentence(s);
      return isRenderableSentence(t) && !isTooSimilar(t, neighborhoodUsed);
    });

    if (additionalRaw) {
      const idx = concept.supportSentences.indexOf(additionalRaw);
      const line = makeLine(
        `additional-${concept.id}-0`,
        additionalRaw,
        "additional",
        0.52,
        concept.supportSentenceIds[idx]
      );
      if (line && !seenTexts.has(line.normalizedText)) {
        seenTexts.add(line.normalizedText);
        additional.push(line);
      }
    }

    // ── TRAP ─────────────────────────────────────────────────────────────────
    // Only genuine contrast/confusion candidates from extractTrapCandidates.
    // No TRAP_RE fallback from support sentences — trap must earn its place.
    let trap: HighlightLine | null = null;
    if (concept.trapCandidates[0]) {
      const line = makeLine(
        `trap-${concept.id}-0`,
        concept.trapCandidates[0],
        "trap",
        0.85
      );
      if (line && !seenTexts.has(line.normalizedText)) {
        seenTexts.add(line.normalizedText);
        trap = line;
      }
    }

    neighborhoods.push({
      id: `neighborhood-${concept.id}`,
      conceptId: concept.id,
      title: concept.title,
      anchor: anchorLine,
      support,
      additional,
      trap,
      priorityScore: concept.score,
      conceptRole: concept.conceptRole,
      depthLevel: "anchor_only",
    });
  }

  const rolePriorities = options?.pageKind === "mathematical_exposition"
    ? MATH_ROLE_PRIORITY
    : ROLE_PRIORITY;

  const finalNeighborhoods = enforceNeighborhoodDepth(neighborhoods)
    .sort((a, b) => {
      // Primary: structural role order (definition → mechanism → example → detail)
      const roleA = rolePriorities[a.conceptRole ?? "detail"] ?? 0;
      const roleB = rolePriorities[b.conceptRole ?? "detail"] ?? 0;
      if (roleA !== roleB) return roleB - roleA;
      // Secondary: concept extraction score
      return b.priorityScore - a.priorityScore;
    });

  // Suppress the guided overlay only when zero structural neighborhoods survive.
  // A single neighborhood is still returned so the legend has one concrete entry
  // rather than falling back to the hardcoded four-tier placeholder. The overlay
  // will show one concept step instead of a full guided path — acceptable for
  // sparse pages. Zero neighborhoods means nothing renderable; return [] so the
  // priority-highlights fallback takes over.
  if (finalNeighborhoods.length === 0) return [];
  return finalNeighborhoods;
}

function enforceNeighborhoodDepth<T extends HighlightNeighborhood>(items: T[]): T[] {
  const mapped = items.map((item) => {
    const support = (item.support ?? []).filter((s) => (s.text || "").trim().length >= 16);
    const additional = (item.additional ?? []).filter((a) => (a.text || "").trim().length >= 16);
    let depthLevel: T["depthLevel"] = "anchor_only";
    if (support.length >= 1) depthLevel = "full";
    else if (additional.length >= 1 || item.trap) depthLevel = "partial";
    return {
      ...item,
      support,
      additional,
      depthLevel,
      priorityScore:
        item.priorityScore -
        (depthLevel === "anchor_only" ? 0.45 : depthLevel === "partial" ? 0.15 : 0),
    };
  });

  // Only suppress anchor_only neighborhoods when deeper alternatives exist on the page.
  // When ALL neighborhoods are anchor_only, keep them — a real anchor is always better than
  // the fuzzy keyword-substring fallback that SmartPDFViewer uses when this array is empty.
  // Threshold lowered from 0.6 → 0.3: sparse pages (math, short prose) were producing
  // anchor_only neighborhoods with priorityScore ~0.35–0.55 that were being suppressed
  // even when no deeper neighborhoods existed, leaving the left panel with no highlights.
  const hasDeep = mapped.some((item) => item.depthLevel === "full" || item.depthLevel === "partial");
  return mapped.filter(
    (item) =>
      item.depthLevel !== "anchor_only" ||
      !hasDeep ||
      item.priorityScore >= 0.3,
    // Definition role is no longer exempt from suppression here — real definition
    // paragraphs receive a high position bonus (+ 0.50 at idx 0) which lifts their
    // priorityScore well above the 0.3 threshold. A definition with score < 0.3
    // after the anchor_only penalty is genuinely thin and should yield to deeper
    // alternatives, per the strictSelectionRules test expectation.
  );
}

/**
 * Flattens neighborhoods into an ordered flat list for renderers that need
 * HighlightLine[]. Order: anchor → support → additional → trap per neighborhood.
 * Preserves neighborhoodId on each line via the id prefix for grouping.
 */
export function flattenNeighborhoods(
  neighborhoods: HighlightNeighborhood[]
): HighlightLine[] {
  return neighborhoods.flatMap((n) => [
    n.anchor,
    ...n.support,
    ...n.additional,
    ...(n.trap ? [n.trap] : []),
  ]);
}

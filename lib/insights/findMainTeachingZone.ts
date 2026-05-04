// lib/insights/findMainTeachingZone.ts
// Selects the top cluster of explanatory paragraphs on a page.
// All downstream scoring runs only on these — not on the full paragraph list.

import type { ParagraphInsight, ParagraphType } from "@/lib/insights/types";

const EXPLANATORY_TYPES = new Set<ParagraphType>([
  "cause_effect",
  "definition",
  "decision",
  "clinical_reasoning",
  "consequence",
  "signal",
  "concept",
  "comparison",
  "formula",
]);

function getParagraphText(p: ParagraphInsight): string {
  return (p.cleanedText || p.rawText || "").trim();
}

function looksLikeMathFormula(text: string): boolean {
  return /[=∫∂∑]|lim\b|d\/d[xt]|\\frac|\\int|\\sum|\bderivative\b|\bintegral\b/i.test(text);
}

function looksLikeMathExplanation(text: string): boolean {
  return /\b(function|sequence|depends on|represent|graph|rate|value|approach|limit|increases?|decreases?)\b/i.test(text);
}

export function findMainTeachingZone(
  paragraphs: ParagraphInsight[],
  options?: { pageKind?: string }
): ParagraphInsight[] {
  if (paragraphs.length <= 5) return paragraphs;

  // Formula and math-explanation bonuses are only meaningful on confirmed math pages.
  // Applying them on science/biology pages causes photosynthesis equations or
  // "rate of reaction" phrases to outscore the actual explanatory prose.
  const isMathPage = options?.pageKind === "mathematical_exposition";

  const scored = paragraphs.map((p, index) => {
    const text = getParagraphText(p);
    const isFormula = p.paragraphType === "formula" || looksLikeMathFormula(text);
    const isMathExplain = looksLikeMathExplanation(text);
    const numeric = p as ParagraphInsight & { explanatoryScore?: number; semanticScore?: number };
    const explanatoryScore = EXPLANATORY_TYPES.has(p.paragraphType) ? 1.0 : 0.3;
    const lengthScore = isFormula ? 0.2 : (text.length > 120 ? 0.2 : -0.2);
    // Definition-primacy bonus: a paragraph whose first sentence directly defines the subject
    // ("X is a ...", "X is defined as ...", "X refers to ...") must outrank longer comparison
    // paragraphs. The wiring audit showed +0.20 was not enough — a 200-word comparison
    // paragraph with explanatoryScore=1.0 + lengthScore=+0.2 scores ~1.0–1.1, while a short
    // definition scores ~0.35–0.55. Raising to +0.45 closes the gap.
    const firstSentence = text.slice(0, 180);
    const isDefinitionLead = /\b(?:is\s+(?:a|an|the|defined|classified|known)|defined\s+as|refers?\s+to|is\s+known\s+as)\b/i.test(firstSentence);
    // Comparison-type penalty: "comparison" paragraphs are trap-adjacent (they contrast/distinguish
    // concepts) and should not outrank primary definition/mechanism paragraphs.
    const isComparisonType = p.paragraphType === "comparison";
    // Page-position bonus: paragraphs that appear earlier on the page establish context
    // and should not be evicted by a denser example section further down.
    // Bonus decays linearly: +0.35 at index 0, zero by index 7.
    const positionBonus = Math.max(0, 0.35 - index * 0.05);
    const zoneScore =
      explanatoryScore * 0.5 +
      Math.min(p.priorityScore / 10, 1.0) * 0.3 +
      lengthScore +
      Math.max(0, numeric.explanatoryScore ?? 0) * 0.2 +
      Math.max(0, numeric.semanticScore ?? 0) * 0.15 +
      (isFormula && isMathPage ? 0.22 : 0) +
      (isMathExplain && isMathPage ? 0.16 : 0) +
      (isDefinitionLead ? 0.45 : 0) +
      (isComparisonType ? -0.15 : 0) +
      positionBonus;
    return { p, index, text, isFormula, isMathExplain, zoneScore };
  });

  const primary = [...scored]
    .sort((a, b) => b.zoneScore - a.zoneScore)
    .slice(0, 5);

  const chosen = new Map<number, ParagraphInsight>();
  for (const item of primary) {
    chosen.set(item.index, item.p);

    if (!item.isFormula) continue;
    const neighbors = [
      scored[item.index - 1],
      scored[item.index + 1],
      scored[item.index - 2],
      scored[item.index + 2],
    ].filter((n): n is NonNullable<typeof n> => Boolean(n));

    const bestNeighbor = neighbors
      .filter((n) => n.isMathExplain || /\b(explain|means|represents|therefore|thus|so)\b/i.test(n.text))
      .sort((a, b) => b.zoneScore - a.zoneScore)[0];

    if (bestNeighbor) chosen.set(bestNeighbor.index, bestNeighbor.p);
  }

  // Hard guarantee: the first paragraph always survives zone selection.
  // It establishes the page's primary subject and must be visible to concept
  // extraction even when a later example-dense section scores higher overall.
  if (paragraphs.length > 0) chosen.set(0, paragraphs[0]);

  return [...chosen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
}

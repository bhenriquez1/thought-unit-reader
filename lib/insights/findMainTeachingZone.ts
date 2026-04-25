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
    const zoneScore =
      explanatoryScore * 0.5 +
      Math.min(p.priorityScore / 10, 1.0) * 0.3 +
      lengthScore +
      Math.max(0, numeric.explanatoryScore ?? 0) * 0.2 +
      Math.max(0, numeric.semanticScore ?? 0) * 0.15 +
      (isFormula && isMathPage ? 0.22 : 0) +
      (isMathExplain && isMathPage ? 0.16 : 0);
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

  return [...chosen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
}

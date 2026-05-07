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
    // Named-substance instance sentences must NOT get the definition-lead bonus.
    // "Iodine is the trace element that..." satisfies isDefinitionLead syntactically but
    // defines iodine (an example), not the page concept. Giving it +0.45 causes it to
    // outrank the actual teaching paragraphs ("Matter consists of elements...").
    const isNamedSubstanceExample =
      /^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+is (a|an|the) (trace|essential|major|minor|macro|micro|most abundant|only)?\s*(element|mineral|compound|ion|vitamin|electrolyte|metalloid|halogen|nutrient)\b/i.test(firstSentence) ||
      /^[A-Z][a-z]{1,15}(?:\s*\([A-Za-z0-9₀-₉²³+\-]+\))?\s+is (the |a |an )?(most|least|only|found|abundant|present|common|approximately|often|mainly|primarily|widely|highly|extremely)\b/i.test(firstSentence);
    const definitionLeadBonus = isDefinitionLead && !isNamedSubstanceExample ? 0.45 : 0;
    // Comparison-type penalty: "comparison" paragraphs are trap-adjacent (they contrast/distinguish
    // concepts) and should not outrank primary definition/mechanism paragraphs.
    const isComparisonType = p.paragraphType === "comparison";
    // Page-position bonus: paragraphs that appear earlier on the page establish context
    // and should not be evicted by a denser example section further down.
    // Bonus decays linearly: +0.35 at index 0, zero by index 7.
    // Use original page-order index (paragraphIndex), not the array index in the
    // already-filtered input. After isValidCoreParagraph drops short intro paragraphs,
    // array index 0 is not necessarily the first page paragraph.
    const positionBonus = Math.max(0, 0.35 - p.paragraphIndex * 0.05);
    const zoneScore =
      explanatoryScore * 0.5 +
      Math.min(p.priorityScore / 10, 1.0) * 0.3 +
      lengthScore +
      Math.max(0, numeric.explanatoryScore ?? 0) * 0.2 +
      Math.max(0, numeric.semanticScore ?? 0) * 0.15 +
      (isFormula && isMathPage ? 0.22 : 0) +
      (isMathExplain && isMathPage ? 0.16 : 0) +
      definitionLeadBonus +
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

  // Hard guarantee: the paragraph with the smallest paragraphIndex (earliest on the
  // page) always survives zone selection. Use paragraphIndex rather than paragraphs[0]
  // because the input array may already be filtered/reordered — paragraphIndex always
  // reflects the original page split order set by processPage.
  if (paragraphs.length > 0) {
    const earliest = paragraphs.reduce(
      (min, q) => q.paragraphIndex < min.paragraphIndex ? q : min,
      paragraphs[0]
    );
    chosen.set(earliest.paragraphIndex, earliest);
  }

  return [...chosen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
}

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

export function findMainTeachingZone(paragraphs: ParagraphInsight[]): ParagraphInsight[] {
  if (paragraphs.length <= 5) return paragraphs;

  return [...paragraphs]
    .map((p) => {
      const text = (p.cleanedText || p.rawText || "").trim();
      const explanatoryScore = EXPLANATORY_TYPES.has(p.paragraphType) ? 1.0 : 0.3;
      const lengthScore = text.length > 120 ? 0.2 : -0.2;
      const zoneScore =
        explanatoryScore * 0.5 +
        Math.min(p.priorityScore / 10, 1.0) * 0.3 +
        lengthScore;
      return { p, zoneScore };
    })
    .sort((a, b) => b.zoneScore - a.zoneScore)
    .slice(0, 5)
    .map(({ p }) => p);
}

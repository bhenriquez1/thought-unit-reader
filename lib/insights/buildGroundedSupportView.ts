import { cleanupSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type { PageInsightModel } from "@/lib/insights/types";

export type GroundedSupportView = {
  mainIdea: string;
  support: string[];
  weakSupport: string[];
};

export function buildGroundedSupportView(pageModel: PageInsightModel | null): GroundedSupportView | null {
  if (!pageModel) return null;

  const mainIdea = pickRenderable([
    pageModel.pageSummary,
    pageModel.topTakeaways[0],
    pageModel.decisionPaths[0]?.interpretation,
    pageModel.paragraphInsights[0]?.summary,
  ]);

  if (!mainIdea) return null;

  const supportPool = [
    ...pageModel.topTakeaways,
    ...pageModel.decisionPaths.flatMap((entry) => [entry.condition, entry.implication]),
    ...pageModel.paragraphInsights.map((paragraph) => paragraph.summary),
  ].map((line) => cleanupSentence(line)).filter((line) => isRenderableSentence(line));

  const deduped = dedupe(supportPool).filter((line) => line !== mainIdea);

  return {
    mainIdea,
    support: deduped.slice(0, 4),
    weakSupport: deduped.slice(4, 8),
  };
}

function pickRenderable(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    const clean = cleanupSentence(candidate || "");
    if (isRenderableSentence(clean)) return clean;
  }
  return null;
}

function dedupe(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

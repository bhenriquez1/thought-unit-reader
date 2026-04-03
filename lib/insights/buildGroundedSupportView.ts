import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type { GuidedReadView, PageInsightModel } from "@/lib/insights/types";

export function buildGroundedSupportView(pageModel: PageInsightModel): GuidedReadView | null {
  const purpose = cleanSentence(pageModel.pageSummary || "");
  const lines = [
    ...pageModel.topTakeaways,
    ...pageModel.decisionPaths.map((entry) => entry.interpretation),
    ...pageModel.decisionPaths.map((entry) => entry.implication),
  ]
    .map((line) => cleanSentence(line || ""))
    .filter((line) => isRenderableSentence(line));

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  if (!unique.length && !isRenderableSentence(purpose)) return null;

  return {
    pagePurpose: isRenderableSentence(purpose) ? purpose : "Grounded support extracted from the current page.",
    steps: unique.slice(0, 3).map((line, index) => ({
      id: `grounded-${index + 1}`,
      stepNumber: index + 1,
      label: index === 0 ? "Main idea" : index === 1 ? "Support" : "Weak support",
      primaryText: line,
      mode: "insight",
      role: "general",
      confidence: 0.65 - index * 0.08,
      evidence: [{ id: `grounded-ev-${index + 1}`, paragraphIndex: index, text: line }],
    })),
    supportTitle: "Grounded support",
    supportBullets: unique.slice(0, 4),
  };
}

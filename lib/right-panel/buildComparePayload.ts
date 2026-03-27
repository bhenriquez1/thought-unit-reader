import type { ActivePageContext, ComparePayload, PageClassification, PageSignals } from "@/lib/readerContracts";

export function buildComparePayload(ctx: ActivePageContext, classification: PageClassification, signals: PageSignals): ComparePayload {
  const text = ctx.pageText.toLowerCase();
  const compareBlocks = (signals.paragraphSignals || []).filter((p) => p.kind === "comparison" && !p.suppress);
  const hasExplicitContrast = /\b(vs\.?|versus|unlike|in contrast|compared with|distinguish)\b/.test(text) || classification.pageType === "comparison" || compareBlocks.length > 0;

  if (!hasExplicitContrast) {
    return {
      hasMeaningfulCompare: false,
      emptyState: "No meaningful contrast on this page yet.",
    };
  }

  const topCompare = compareBlocks.sort((a, b) => b.yieldScore - a.yieldScore)[0]?.text;

  return {
    hasMeaningfulCompare: true,
    compareTitle: "Grounded contrast on this page",
    leftLabel: "Concept A",
    rightLabel: "Concept B",
    similarities: topCompare ? [topCompare] : ["Share the same domain"],
    differences: ["Differ in mechanism, use, or implication"],
    examTrap: "Do not swap criteria under time pressure.",
  };
}

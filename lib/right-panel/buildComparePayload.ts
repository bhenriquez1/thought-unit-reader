import type { ActivePageContext, ComparePayload, PageClassification } from "@/lib/readerContracts";

export function buildComparePayload(ctx: ActivePageContext, classification: PageClassification): ComparePayload {
  const text = ctx.pageText.toLowerCase();
  const hasExplicitContrast = /\b(vs\.?|versus|unlike|in contrast|compared with)\b/.test(text) || classification.pageType === "comparison";

  if (!hasExplicitContrast) {
    return {
      hasMeaningfulCompare: false,
      emptyState: "No meaningful contrast on this page yet.",
    };
  }

  return {
    hasMeaningfulCompare: true,
    compareTitle: "Grounded contrast on this page",
    leftLabel: "Concept A",
    rightLabel: "Concept B",
    similarities: ["Share the same domain"],
    differences: ["Differ in mechanism, use, or implication"],
    examTrap: "Do not swap criteria under time pressure.",
  };
}

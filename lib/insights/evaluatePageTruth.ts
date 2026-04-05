import type { PageInsightModel } from "@/lib/insights/types";
import type { PageContentClass } from "@/lib/pdf/classifyPageContent";

export type PageTruthGateResult = {
  canRenderRightPanel: boolean;
  canRenderLeftHighlights: boolean;
  reason:
    | "ok"
    | "loading"
    | "stale_page"
    | "book_changed"
    | "insufficient_prose"
    | "image_only"
    | "form_page"
    | "table_heavy"
    | "fragment_only"
    | "failed_extraction"
    | "front_matter";
  confidence: number;
};

type EvaluateArgs = {
  visibleDocumentId: string;
  sourceDocumentId: string;
  visiblePageNumber: number;
  sourcePageNumber: number;
  parseReady: boolean;
  contentClass: PageContentClass;
  pageModel: PageInsightModel | null;
  visiblePageText: string;
  formulaSignalsCount?: number;
};

export function evaluatePageTruth(args: EvaluateArgs): PageTruthGateResult {
  const tokenCount = (args.visiblePageText.match(/[A-Za-z]+/g) || []).length;
  const completeSentences = (args.visiblePageText.match(/[.!?](\s|$)/g) || []).length;

  if (!args.parseReady) return fail("loading", 0);
  if (args.visibleDocumentId !== args.sourceDocumentId) return fail("book_changed", 0);
  if (args.visiblePageNumber !== args.sourcePageNumber) return fail("stale_page", 0);
  if (!args.pageModel) return fail("failed_extraction", 0.1);

  if (args.contentClass === "image_only") return fail("image_only", 0.2);
  if (args.contentClass === "form_page") return fail("form_page", 0.3, true);
  if (args.contentClass === "table_heavy") return fail("table_heavy", 0.35, true);
  if (args.contentClass === "failed_sparse") return fail("failed_extraction", 0.2);
  if (args.contentClass === "copyright_frontmatter") return fail("front_matter", 0.2);
  if (tokenCount < 25 || completeSentences < 2) {
    if ((args.formulaSignalsCount || 0) > 0) {
      return {
        canRenderRightPanel: true,
        canRenderLeftHighlights: true,
        reason: "ok",
        confidence: 0.42,
      };
    }
    return fail("insufficient_prose", 0.35, args.contentClass === "sparse_text");
  }

  const fragmentHeavy = args.pageModel.topTakeaways.every((line) => /\.\.\.$/.test(line.trim()));
  if (fragmentHeavy) return fail("fragment_only", 0.25);

  return {
    canRenderRightPanel: true,
    canRenderLeftHighlights: true,
    reason: "ok",
    confidence: Math.min(1, 0.45 + Math.min(0.4, completeSentences * 0.08)),
  };
}

function fail(reason: PageTruthGateResult["reason"], confidence: number, leftOk = false): PageTruthGateResult {
  return {
    canRenderRightPanel: false,
    canRenderLeftHighlights: leftOk,
    reason,
    confidence,
  };
}

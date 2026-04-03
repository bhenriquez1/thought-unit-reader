import type { PageInsightModel } from "@/lib/insights/types";
import type { PageContentClass } from "@/lib/pdf/classifyPageContent";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";

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
    | "failed_extraction";
  confidence: number;
};

export function evaluatePageTruth(args: {
  visibleDocumentId: string;
  visiblePageNumber: number;
  visiblePageHash: string;
  sourceDocumentId: string;
  sourcePageNumber: number;
  sourcePageHash: string;
  insightsStatus: "idle" | "loading" | "ready" | "error";
  pageModel: PageInsightModel | null;
  pageClass: PageContentClass;
}): PageTruthGateResult {
  const {
    visibleDocumentId,
    visiblePageNumber,
    visiblePageHash,
    sourceDocumentId,
    sourcePageNumber,
    sourcePageHash,
    insightsStatus,
    pageModel,
    pageClass,
  } = args;

  if (insightsStatus === "loading" || insightsStatus === "idle") {
    return { canRenderRightPanel: false, canRenderLeftHighlights: false, reason: "loading", confidence: 0 };
  }
  if (visibleDocumentId !== sourceDocumentId) {
    return { canRenderRightPanel: false, canRenderLeftHighlights: false, reason: "book_changed", confidence: 0 };
  }
  if (visiblePageNumber !== sourcePageNumber || visiblePageHash !== sourcePageHash) {
    return { canRenderRightPanel: false, canRenderLeftHighlights: false, reason: "stale_page", confidence: 0 };
  }
  if (insightsStatus === "error" || !pageModel) {
    return { canRenderRightPanel: false, canRenderLeftHighlights: false, reason: "failed_extraction", confidence: 0.1 };
  }

  if (pageClass === "image_only") return { canRenderRightPanel: false, canRenderLeftHighlights: false, reason: "image_only", confidence: 0.2 };
  if (pageClass === "form_page") return { canRenderRightPanel: false, canRenderLeftHighlights: true, reason: "form_page", confidence: 0.35 };
  if (pageClass === "table_heavy") return { canRenderRightPanel: false, canRenderLeftHighlights: true, reason: "table_heavy", confidence: 0.4 };
  if (pageClass === "failed_sparse") return { canRenderRightPanel: false, canRenderLeftHighlights: false, reason: "failed_extraction", confidence: 0.15 };

  const completeSentences = pageModel.paragraphInsights
    .map((entry) => entry.summary)
    .filter((line) => isRenderableSentence(line)).length;

  if (completeSentences < 2) {
    return { canRenderRightPanel: false, canRenderLeftHighlights: pageClass === "sparse_text", reason: "fragment_only", confidence: 0.3 };
  }

  if (pageModel.paragraphInsights.length < 1) {
    return { canRenderRightPanel: false, canRenderLeftHighlights: false, reason: "insufficient_prose", confidence: 0.25 };
  }

  return { canRenderRightPanel: true, canRenderLeftHighlights: true, reason: "ok", confidence: 0.7 };
}

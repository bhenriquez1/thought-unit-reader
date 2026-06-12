// lib/highlights/persistAnchorsAsHighlights.ts
// Centralized entry point so every RightPanel "save" action (Save to NoteLab,
// Save to Recall, ...) persists the visual anchors that backed the saved item
// into savedHighlightsStore — closing the chain:
//   RightPanel action → anchors captured → persisted → loaded for page →
//   merged → rendered in LeftPanel.

import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import { saveHighlightsForPage } from "@/lib/highlights/savedHighlightsStore";

export async function persistVisualAnchorsAsHighlights(
  bookId: string,
  page: number,
  studyModel: CurrentPageStudyModel | null | undefined,
  sourceType: "note" | "recall",
  sourceRefId: string,
): Promise<number> {
  const visualAnchors = studyModel?.visualAnchors ?? [];

  if (visualAnchors.length === 0) {
    console.log("[HIGHLIGHT_PERSIST_FROM_SAVE]", {
      bookId, page, sourceType, sourceRefId, anchorCount: 0,
      reason: "studyModel has no visualAnchors",
    });
    return 0;
  }

  const anchors = visualAnchors.map((a) => ({
    text: a.exactText,
    anchorType: a.role,
    reason: a.reason,
  }));

  await saveHighlightsForPage(bookId, page, anchors, sourceType, sourceRefId);

  console.log("[HIGHLIGHT_PERSIST_FROM_SAVE]", {
    bookId, page, sourceType, sourceRefId, anchorCount: anchors.length,
  });

  return anchors.length;
}

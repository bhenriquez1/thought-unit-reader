/**
 * buildHighlightPlan.ts
 *
 * Derives the highlight plan for the left panel from paragraph notes.
 * Instead of mapping directly from raw story blocks, V3 selects which
 * paragraphs deserve visual emphasis based on reading priority and kind.
 *
 * Plan:
 *   - 1 dominant highlight  (read_first  → main, important)
 *   - up to 2 support highlights (read_second → support, support)
 *   - 1 warning highlight   (warning     → support, warning)
 *
 * Total: max 4 highlights. This keeps the left panel intentional rather than
 * washing every paragraph with equal-opacity tints.
 */

import type {
  HighlightPlanItemV3,
  HighlightPriorityV3,
  HighlightSemanticKindV3,
  ParagraphNoteV3,
} from "./types";

function priorityTier(note: ParagraphNoteV3): HighlightPriorityV3 {
  if (note.priority === "read_first") return "main";
  if (note.priority === "warning")    return "support";
  return "support";
}

function semanticKind(note: ParagraphNoteV3): HighlightSemanticKindV3 {
  return note.kind; // ParagraphNoteKind is a subset of HighlightSemanticKindV3
}

/**
 * Builds a paragraph-dominant highlight plan from V3 paragraph notes.
 * Returns at most 4 items: 1 dominant + up to 2 support + 1 warning.
 */
export function buildHighlightPlan(
  notes: ParagraphNoteV3[],
  pageNumber: number,
): HighlightPlanItemV3[] {
  const plan: HighlightPlanItemV3[] = [];

  // Dominant: first read_first note
  const dominant = notes.find((n) => n.priority === "read_first");
  if (dominant) {
    plan.push({
      id:           `hplan-main-${dominant.sourceBlockId}`,
      blockId:      dominant.sourceBlockId,
      pageNumber,
      semanticKind: semanticKind(dominant),
      priority:     "main",
    });
  }

  // Warning: first trap note (promoted above support in visual hierarchy)
  const trapNote = notes.find((n) => n.priority === "warning");
  if (trapNote) {
    plan.push({
      id:           `hplan-warn-${trapNote.sourceBlockId}`,
      blockId:      trapNote.sourceBlockId,
      pageNumber,
      semanticKind: "warning",
      priority:     "support",
    });
  }

  // Support: up to 2 read_second notes (excluding any already in plan)
  const planIds = new Set(plan.map((p) => p.blockId));
  const supportNotes = notes
    .filter((n) => n.priority === "read_second" && !planIds.has(n.sourceBlockId))
    .slice(0, 2);

  for (const note of supportNotes) {
    plan.push({
      id:           `hplan-support-${note.sourceBlockId}`,
      blockId:      note.sourceBlockId,
      pageNumber,
      semanticKind: semanticKind(note),
      priority:     priorityTier(note),
    });
  }

  return plan;
}

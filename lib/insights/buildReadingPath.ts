/**
 * buildReadingPath.ts
 *
 * Converts paragraph notes into an ordered reading path — the "read in this
 * order" list that tells the reader exactly where to look first on the page.
 *
 * Ordering:
 *   1. read_first  — dominant paragraph (main signal / bottom line)
 *   2. warning     — traps always surfaced before support detail
 *   3. read_second — key support (rules, mechanisms)
 *   4. read_later  — secondary support
 *   (optional paragraphs are excluded from the path)
 *
 * Each step gets a brief human-facing label derived from the note's operator
 * label and priority, so the right panel can render a numbered scan path.
 */

import type { ParagraphNoteV3, ReadingStepV3 } from "./types";

const PRIORITY_ORDER: Record<string, number> = {
  read_first:  0,
  warning:     1,
  read_second: 2,
  read_later:  3,
  optional:    99,
};

function stepLabel(note: ParagraphNoteV3): string {
  switch (note.priority) {
    case "read_first":  return note.operatorLabel ?? "Main point";
    case "warning":     return "Watch for";
    case "read_second": return note.operatorLabel ?? "Then read";
    case "read_later":  return note.operatorLabel ?? "Also note";
    default:            return note.operatorLabel ?? "Note";
  }
}

/**
 * Returns reading steps in scan order. Only includes paragraphs with priority
 * read_first / read_second / read_later / warning. Optional paragraphs are
 * excluded — they don't earn a place in the reading path.
 *
 * Capped at 5 steps so the path stays actionable rather than exhaustive.
 */
export function buildReadingPath(notes: ParagraphNoteV3[]): ReadingStepV3[] {
  const eligible = notes
    .filter((n) => n.priority !== "optional")
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      // Within the same priority tier, preserve original reading order
      return a.paragraphIndex - b.paragraphIndex;
    })
    .slice(0, 5);

  return eligible.map((note, i) => ({
    id:             `step-${i + 1}-${note.sourceBlockId}`,
    label:          stepLabel(note),
    sourceBlockId:  note.sourceBlockId,
    paragraphIndex: note.paragraphIndex,
    priority:       note.priority,
    note:           note.summarySentence,
  }));
}

/**
 * buildReadingPath.ts
 *
 * Converts paragraph notes into a short ordered reading path — the "read in
 * this order" list that tells the user exactly where to look first.
 *
 * This is intentionally short (default maxSteps = 4). It should feel like a
 * reading guide, not another summary dump.
 *
 * Ordering:
 *   1. read_first  (important notes)
 *   2. read_second (support, rules, mechanisms)
 *   3. warning     (traps — always surfaced before optional detail)
 *   4. read_later  (secondary support)
 *   (optional paragraphs excluded)
 *
 * Each step gets a human-facing label:
 *   - "Read this first" / "Key point" for important
 *   - "Do not miss" for warnings
 *   - "Read this next" for support
 *   - "Additional context" for additional
 */

import type {
  ParagraphNoteV3,
  ReadingPriority,
  ReadingStepV3,
} from "./types";
import { canonicalTextKey, cleanBlockText } from "./textCleanup";

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type BuildReadingPathInput = {
  paragraphNotes: ParagraphNoteV3[];
  maxSteps?: number;
};

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------

function priorityRank(priority: ReadingPriority): number {
  switch (priority) {
    case "read_first":  return 0;
    case "read_second": return 1;
    case "warning":     return 2;
    case "read_later":  return 3;
    case "optional":
    default:            return 4;
  }
}

function noteKindRank(kind: ParagraphNoteV3["kind"]): number {
  switch (kind) {
    case "important":   return 0;
    case "warning":     return 1;
    case "support":     return 2;
    case "additional":
    default:            return 3;
  }
}

function sortNotesForPath(notes: ParagraphNoteV3[]): ParagraphNoteV3[] {
  return [...notes].sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;

    const kr = noteKindRank(a.kind) - noteKindRank(b.kind);
    if (kr !== 0) return kr;

    if (a.paragraphIndex !== b.paragraphIndex) return a.paragraphIndex - b.paragraphIndex;
    return a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// Best note text for a step
// ---------------------------------------------------------------------------

function bestStepNote(note: ParagraphNoteV3): string {
  const summary = cleanBlockText(note.summarySentence);

  // For warnings: prefer the warningNote if meaningfully different
  if (note.kind === "warning" && note.warningNote) {
    const warning = cleanBlockText(note.warningNote);
    if (warning && canonicalTextKey(warning) !== canonicalTextKey(summary)) {
      return warning;
    }
  }

  // For everything else: summary sentence is the cleanest single-sentence note
  return summary;
}

// ---------------------------------------------------------------------------
// Step label
// ---------------------------------------------------------------------------

function labelForStep(note: ParagraphNoteV3, stepIndex: number): string {
  if (note.kind === "important") {
    return stepIndex === 0 ? "Read this first" : "Key point";
  }
  if (note.kind === "warning") return "Do not miss";
  if (note.kind === "support") return "Read this next";
  return "Additional context";
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function dedupePathNotes(notes: ParagraphNoteV3[]): ParagraphNoteV3[] {
  const seen = new Set<string>();
  const out: ParagraphNoteV3[] = [];
  for (const note of notes) {
    const key = canonicalTextKey(bestStepNote(note));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Returns an ordered reading path from paragraph notes.
 * Only includes notes with priority read_first / read_second / warning /
 * read_later. Optional notes are always excluded.
 * Capped at maxSteps (default 4) to stay actionable.
 */
export function buildReadingPath(
  input: BuildReadingPathInput,
): ReadingStepV3[] {
  const { paragraphNotes, maxSteps = 4 } = input;
  if (!paragraphNotes.length) return [];

  const sorted  = sortNotesForPath(paragraphNotes.filter((n) => n.priority !== "optional"));
  const deduped = dedupePathNotes(sorted);

  return deduped.slice(0, maxSteps).map((note, idx): ReadingStepV3 => ({
    id:             `reading-step:${note.id}`,
    label:          labelForStep(note, idx),
    sourceBlockId:  note.sourceBlockId,
    paragraphIndex: note.paragraphIndex,
    priority:       note.priority,
    note:           bestStepNote(note),
  }));
}

/**
 * buildParagraphNotes.ts
 *
 * Converts the raw v2 pipeline output (normalized blocks + role assignments)
 * into a reader-facing paragraph map: one note per meaningful paragraph,
 * in page reading order, with a role that directly maps to the universal
 * color system (Important / Support / Additional / Warning).
 */

import type {
  NormalizedPageBlock,
  PageClass,
  ParagraphRoleAssignment,
  ParagraphRoleV2,
} from "./types";
import { bestCompleteSentence, extractCompleteSentences } from "./textCleanup";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReaderRole = "important" | "support" | "additional" | "warning";

export type ParagraphNote = {
  /** 0-based index within the page, preserves reading order */
  paragraphIndex: number;
  blockId: string;
  role: ReaderRole;
  /** Primary note — always a complete sentence */
  text: string;
  /** Optional detail line — second complete sentence when available */
  detail?: string;
};

// ---------------------------------------------------------------------------
// Role mapping  (ParagraphRoleV2 → ReaderRole)
// ---------------------------------------------------------------------------

const ROLE_MAP: Record<ParagraphRoleV2, ReaderRole | null> = {
  primary_signal:      "important",
  bottom_line:         "important",
  decision_rule:       "support",
  mechanism:           "support",
  support_explanation: "support",
  support_relation:    "additional",
  support_distinction: "additional",
  background:          "additional",
  trap_warning:        "warning",
};

// Minimum role-assignment score to emit a note.
// All roles use 1 — block-kind filtering (SKIP_BLOCK_KINDS) handles structural
// noise. MIN_SCORE > 1 was silently killing all "background" prose paragraphs
// because every background block scores exactly 1, producing 0 paragraph notes
// on descriptive pages and forcing the right panel into the story-card fallback.
const MIN_SCORE: Record<ReaderRole, number> = {
  important:  1,
  support:    1,
  additional: 1,
  warning:    1,
};

// Block kinds that never produce useful paragraph notes.
// Headings are chapter titles, captions are figure labels, etc.
const SKIP_BLOCK_KINDS = new Set([
  "heading", "caption", "diagram_label", "table_row", "form_field",
]);

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Returns paragraph notes in reading order (by blockIndex).
 * Each note is a complete-sentence summary of one page paragraph,
 * labelled with its reader role.
 */
export function buildParagraphNotes(
  blocks: NormalizedPageBlock[],
  assignments: ParagraphRoleAssignment[],
  _pageClass: PageClass,
): ParagraphNote[] {
  const assignmentMap = new Map<string, ParagraphRoleAssignment>();
  for (const a of assignments) assignmentMap.set(a.blockId, a);

  const seenTexts = new Set<string>();
  const notes: ParagraphNote[] = [];

  // Iterate blocks in their original reading order
  for (const block of blocks) {
    if (block.isLikelyNoise) continue;
    // Skip structural/non-prose block kinds — they produce noise notes
    // (e.g., chapter heading appearing as "Important: Chapter 12 — Scalp Flaps")
    if (SKIP_BLOCK_KINDS.has(block.kind)) continue;

    const assignment = assignmentMap.get(block.id);
    if (!assignment) continue;

    const readerRole = ROLE_MAP[assignment.role];
    if (!readerRole) continue;

    if (assignment.score < MIN_SCORE[readerRole]) continue;

    const text = bestCompleteSentence(block.text);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);

    // Detail: second complete sentence, only if meaningfully different from primary
    const sentences = extractCompleteSentences(block.text);
    const detailCandidate = sentences.find((s) => s !== text && s.length >= 20);

    notes.push({
      paragraphIndex: block.blockIndex,
      blockId: block.id,
      role: readerRole,
      text,
      detail: detailCandidate,
    });
  }

  return notes;
}

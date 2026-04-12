/**
 * buildParagraphNotesV3.ts
 *
 * Converts ParagraphRoleAssignmentV3 + NormalizedPageBlock data into
 * human-readable ParagraphNoteV3 objects — one per meaningful paragraph,
 * in original reading order.
 *
 * Each note contains:
 *   - summarySentence: the strongest complete sentence from the paragraph
 *   - whyItMatters: optional second distinct sentence (context/reason)
 *   - actionNote: imperative-form note for decision_rule paragraphs
 *   - warningNote: alert text for trap_warning paragraphs
 *   - operatorLabel: reader-facing role label for the card header
 *
 * Production rules enforced here:
 *   Rule 1 — no incomplete sentence ever reaches final render
 *   Rule 2 — no two notes may emit the same canonical sentence
 *   Rule 5 — captions/URLs/headers must never become page-level content
 */

import type {
  NormalizedPageBlock,
  ParagraphNoteKind,
  ParagraphNoteV3,
  ParagraphRoleAssignmentV3,
  ParagraphRoleV2,
  ReadingPriority,
} from "./types";
import {
  bestCompleteSentence,
  extractCompleteSentences,
  canonicalTextKey,
} from "./textCleanup";

// Block kinds that should never produce a paragraph note
const SKIP_KINDS = new Set([
  "heading", "caption", "diagram_label", "table_row", "form_field",
]);

// Minimum confidence threshold for emitting a note.
// Blocks with near-zero salience (pure noise that passed the noise filter)
// are still suppressed here.
const MIN_SALIENCE_FOR_NOTE = 0.5;

// ---------------------------------------------------------------------------
// Role → kind mapping
// ---------------------------------------------------------------------------

const ROLE_TO_KIND: Record<ParagraphRoleV2, ParagraphNoteKind> = {
  primary_signal:      "important",
  bottom_line:         "important",
  decision_rule:       "support",
  mechanism:           "support",
  support_explanation: "support",
  support_relation:    "additional",
  support_distinction: "additional",
  trap_warning:        "warning",
  background:          "additional",
};

// ---------------------------------------------------------------------------
// Role → operator label (right-panel card header)
// ---------------------------------------------------------------------------

function operatorLabelForRole(
  role: ParagraphRoleV2,
  priority: ReadingPriority,
): string {
  switch (role) {
    case "primary_signal":
      return priority === "read_first" ? "Key concept" : "Signal";
    case "bottom_line":
      return "Bottom line";
    case "decision_rule":
      return "Rule";
    case "mechanism":
      return "Mechanism";
    case "support_relation":
      return "Relation";
    case "support_distinction":
      return "Distinction";
    case "trap_warning":
      return "Warning";
    case "support_explanation":
      return "Support";
    case "background":
      return "Additional";
    default:
      return "Note";
  }
}

// ---------------------------------------------------------------------------
// Confidence from salience score
// ---------------------------------------------------------------------------

function normalizeConfidence(salience: number): number {
  return Math.min(1, Math.max(0.1, salience / 10));
}

// ---------------------------------------------------------------------------
// Extract a "why it matters" sentence
//
// Prefers a sentence that follows the main sentence and adds context
// (reasons, consequences, comparisons). Avoids repeating the summary.
// ---------------------------------------------------------------------------

function extractWhyItMatters(
  allSentences: string[],
  summarySentence: string,
): string | undefined {
  const summary = summarySentence.toLowerCase();
  const candidate = allSentences.find((s) => {
    if (s === summarySentence) return false;
    if (s.length < 25)         return false;
    const lower = s.toLowerCase();
    // Prefer explanatory / consequential language
    if (/\b(because|therefore|due to|results in|leads to|so that|which means|since)\b/.test(lower)) {
      return true;
    }
    // Accept any sentence that isn't just a restatement
    return lower.slice(0, 50) !== summary.slice(0, 50);
  });
  return candidate;
}

// ---------------------------------------------------------------------------
// Extract an action note for decision_rule paragraphs
// ---------------------------------------------------------------------------

function extractActionNote(sentences: string[]): string | undefined {
  return sentences.find((s) => {
    const lower = s.toLowerCase();
    return /\b(must|should|always|never|avoid|use|check|confirm|rule out|evaluate|assess|obtain)\b/.test(lower);
  });
}

// ---------------------------------------------------------------------------
// Extract a warning note for trap_warning paragraphs
// ---------------------------------------------------------------------------

function extractWarningNote(sentences: string[]): string | undefined {
  return sentences.find((s) => {
    const lower = s.toLowerCase();
    return /\b(avoid|risk|danger|pitfall|mistake|error|do not|don't|warning|except|unless|complication)\b/.test(lower);
  });
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildParagraphNotesV3(
  blocks: NormalizedPageBlock[],
  assignments: ParagraphRoleAssignmentV3[],
): ParagraphNoteV3[] {
  // Build lookup maps
  const assignmentMap = new Map(assignments.map((a) => [a.blockId, a]));
  const blockMap      = new Map(blocks.map((b) => [b.id, b]));

  const seenTexts = new Set<string>();
  const notes: ParagraphNoteV3[] = [];

  // Emit notes in original reading order (blockIndex ascending)
  const orderedBlocks = [...blocks].sort((a, b) => a.blockIndex - b.blockIndex);

  for (const block of orderedBlocks) {
    if (block.isLikelyNoise)          continue;
    if (SKIP_KINDS.has(block.kind))   continue;
    if (block.text.trim().length < 30) continue;

    const assignment = assignmentMap.get(block.id);
    if (!assignment) continue;
    if (assignment.salience.salience < MIN_SALIENCE_FOR_NOTE) continue;

    const summarySentence = bestCompleteSentence(block.text);
    if (!summarySentence) continue;

    // Rule 2 — no duplicate canonical sentences
    const key = canonicalTextKey(summarySentence);
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);

    const allSentences = extractCompleteSentences(block.text);
    const kind         = ROLE_TO_KIND[assignment.role];
    const label        = operatorLabelForRole(assignment.role, assignment.readingPriority);

    const whyItMatters = extractWhyItMatters(allSentences, summarySentence);
    const actionNote   = assignment.role === "decision_rule"
      ? extractActionNote(allSentences)
      : undefined;
    const warningNote  = assignment.role === "trap_warning"
      ? extractWarningNote(allSentences) ?? summarySentence
      : undefined;

    notes.push({
      id:             `v3note-${block.id}`,
      sourceBlockId:  block.id,
      paragraphIndex: block.blockIndex,
      pageNumber:     block.pageNumber,
      kind,
      priority:       assignment.readingPriority,
      intent:         assignment.readerIntent,
      originalText:   block.text,
      summarySentence,
      whyItMatters,
      actionNote,
      warningNote,
      operatorLabel:  label,
      confidence:     normalizeConfidence(assignment.salience.salience),
    });
  }

  return notes;
}

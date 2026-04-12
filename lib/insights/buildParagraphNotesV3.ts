/**
 * buildParagraphNotesV3.ts
 *
 * Converts ParagraphRoleAssignmentV3 + NormalizedPageBlock data into
 * ParagraphNoteV3 objects — one per meaningful paragraph, ordered by
 * reading priority (read_first → warning → read_second → read_later).
 *
 * This is the layer that gives the system a reader voice:
 * not extracted text, not relabeled prose — resident notes, surgeon briefing,
 * pilot checklist. Each paragraph becomes a compressed note with:
 *   - summarySentence: the strongest complete sentence
 *   - whyItMatters: explanatory follow-on (for important/mechanism)
 *   - actionNote: imperative sentence (for decision_rule)
 *   - warningNote: alert sentence (for trap_warning)
 *   - operatorLabel: card header ("Rule", "Warning", "Bottom line", etc.)
 *
 * Note: role values follow ParagraphRoleV2 naming (primary_signal,
 * decision_rule, trap_warning, support_relation, etc.).
 */

import type {
  NormalizedPageBlock,
  PageClass,
  PageReadingMode,
  ParagraphNoteKind,
  ParagraphNoteV3,
  ParagraphRoleAssignmentV3,
  ParagraphRoleV2,
  ReadingPriority,
} from "./types";
import {
  bestCompleteSentence,
  canonicalTextKey,
  cleanBlockText,
  extractCompleteSentences,
  sentenceSafeSupport,
} from "./textCleanup";

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type BuildParagraphNotesInput = {
  blocks:      NormalizedPageBlock[];
  assignments: ParagraphRoleAssignmentV3[];
  pageClass:   PageClass;
  readingMode: PageReadingMode;
};

// ---------------------------------------------------------------------------
// Priority weighting — controls confidence and sort order
// ---------------------------------------------------------------------------

function priorityWeight(priority: ReadingPriority): number {
  switch (priority) {
    case "read_first":  return 1.00;
    case "read_second": return 0.85;
    case "warning":     return 0.82;
    case "read_later":  return 0.65;
    case "optional":
    default:            return 0.45;
  }
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ---------------------------------------------------------------------------
// Role → note kind
// ---------------------------------------------------------------------------

function noteKindFromRole(role: ParagraphRoleV2): ParagraphNoteKind {
  switch (role) {
    case "trap_warning":
      return "warning";
    case "primary_signal":
    case "bottom_line":
      return "important";
    case "decision_rule":
    case "mechanism":
    case "support_explanation":
    case "support_relation":
    case "support_distinction":
      return "support";
    case "background":
    default:
      return "additional";
  }
}

function noteKindFromPriority(
  role: ParagraphRoleV2,
  priority: ReadingPriority,
): ParagraphNoteKind {
  if (priority === "warning" || role === "trap_warning") return "warning";
  if (priority === "read_first")                         return "important";
  if (priority === "read_second" || priority === "read_later") return "support";
  return noteKindFromRole(role);
}

// ---------------------------------------------------------------------------
// Role → operator label (right-panel card header)
// ---------------------------------------------------------------------------

function labelForRole(role: ParagraphRoleV2): string {
  switch (role) {
    case "primary_signal":       return "Important";
    case "decision_rule":        return "Rule";
    case "mechanism":            return "Why";
    case "support_relation":     return "Connection";
    case "support_distinction":  return "Difference";
    case "trap_warning":         return "Warning";
    case "bottom_line":          return "Bottom line";
    case "support_explanation":  return "Support";
    case "background":
    default:                     return "Additional";
  }
}

// ---------------------------------------------------------------------------
// Note field builders
// ---------------------------------------------------------------------------

function sentenceForRole(
  _role: ParagraphRoleV2,
  sentence: string,
): string {
  // Conservative: do not rewrite content semantics.
  // Clean and return the best sentence as-is; the reader trusts the source.
  return cleanBlockText(sentence);
}

function buildWhyItMatters(
  role: ParagraphRoleV2,
  supportSentences: string[],
  readingMode: PageReadingMode,
): string | undefined {
  if (!supportSentences.length) return undefined;
  const best = supportSentences[0];
  if (!best) return undefined;

  switch (role) {
    case "primary_signal":
    case "bottom_line":
    case "mechanism":
    case "support_relation":
    case "support_distinction":
      return best;
    case "decision_rule":
      return readingMode === "clinical_page" ? best : undefined;
    default:
      return undefined;
  }
}

function buildActionNote(
  role: ParagraphRoleV2,
  supportSentences: string[],
  readingMode: PageReadingMode,
  pageClass: PageClass,
): string | undefined {
  if (role === "decision_rule") return supportSentences[0];
  if (readingMode === "form_page" || pageClass === "form_checklist") {
    return supportSentences[0];
  }
  return undefined;
}

function buildWarningNote(
  role: ParagraphRoleV2,
  summarySentence: string,
  supportSentences: string[],
): string | undefined {
  if (role === "trap_warning") return summarySentence;
  return supportSentences.find((s) =>
    /\b(avoid|warning|risk|pitfall|mistake|error|wrong|except|unless)\b/i.test(s),
  );
}

// ---------------------------------------------------------------------------
// Sort assignments by reading priority then salience then reading order
// ---------------------------------------------------------------------------

function sortAssignmentsForReading(
  assignments: ParagraphRoleAssignmentV3[],
  blockMap: Map<string, NormalizedPageBlock>,
): ParagraphRoleAssignmentV3[] {
  return [...assignments].sort((a, b) => {
    const pw = priorityWeight(b.readingPriority) - priorityWeight(a.readingPriority);
    if (pw !== 0) return pw;

    const sw = b.salience.salience - a.salience.salience;
    if (sw !== 0) return sw;

    const ia = blockMap.get(a.blockId)?.blockIndex ?? Number.MAX_SAFE_INTEGER;
    const ib = blockMap.get(b.blockId)?.blockIndex ?? Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function dedupeNotes(notes: ParagraphNoteV3[]): ParagraphNoteV3[] {
  const seen = new Set<string>();
  const out: ParagraphNoteV3[] = [];
  for (const note of notes) {
    const key = canonicalTextKey(note.summarySentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildParagraphNotes(
  input: BuildParagraphNotesInput,
): ParagraphNoteV3[] {
  const { blocks, assignments, pageClass, readingMode } = input;

  const blockMap = new Map(blocks.map((b) => [b.id, b]));
  const ordered  = sortAssignmentsForReading(assignments, blockMap);

  const notes: ParagraphNoteV3[] = [];

  for (const assignment of ordered) {
    const block = blockMap.get(assignment.blockId);
    if (!block)             continue;
    if (block.isLikelyNoise) continue;

    const mainSentence =
      bestCompleteSentence(block.text) ??
      extractCompleteSentences(block.text)[0] ??
      null;
    if (!mainSentence) continue;

    const supportSentences = sentenceSafeSupport(
      extractCompleteSentences(block.text).filter((s) => s !== mainSentence),
      2,
    );

    const summarySentence = sentenceForRole(assignment.role, mainSentence);
    const kind            = noteKindFromPriority(assignment.role, assignment.readingPriority);

    notes.push({
      id:             `paragraph-note:${block.id}`,
      sourceBlockId:  block.id,
      paragraphIndex: block.blockIndex,
      pageNumber:     block.pageNumber,
      kind,
      priority:       assignment.readingPriority,
      intent:         assignment.readerIntent,
      originalText:   block.text,
      summarySentence,
      whyItMatters:   buildWhyItMatters(assignment.role, supportSentences, readingMode),
      actionNote:     buildActionNote(assignment.role, supportSentences, readingMode, pageClass),
      warningNote:    buildWarningNote(assignment.role, summarySentence, supportSentences),
      operatorLabel:  labelForRole(assignment.role),
      confidence:     clampConfidence(
        (assignment.salience.salience / 10) * priorityWeight(assignment.readingPriority),
      ),
    });
  }

  return dedupeNotes(notes);
}

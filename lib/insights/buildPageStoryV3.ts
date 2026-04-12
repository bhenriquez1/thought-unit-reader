/**
 * buildPageStoryV3.ts
 *
 * Human-reader simulation layer — V3 pipeline.
 *
 * Architectural shift from V2:
 *   V2: raw blocks → story blocks → page feel
 *   V3: raw blocks → paragraph salience → paragraph notes → story blocks → page feel
 *
 * The story blocks in V3 are synthesized FROM paragraph notes, not directly
 * from block assignments. This ensures that operator cards always trace to a
 * paragraph the reader would actually notice, not to the highest-scoring raw
 * block regardless of reading context.
 *
 * Pipeline (5-pass human-reader simulation):
 *   Pass 1 — orient:      segment + normalize + classify page type + reading mode
 *   Pass 2 — detect:      assign paragraph salience (role + priority + intent)
 *   Pass 3 — compress:    build paragraph-native notes (summary sentence + why)
 *   Pass 4 — structure:   build page brief + reading path
 *   Pass 5 — operationalize: synthesize story blocks + highlight plan from notes
 */

import type {
  BuildPageStoryV3Input,
  NormalizedPageBlock,
  PageBriefStatusV3,
  PageBriefV3,
  PageClass,
  PageReadingMode,
  PageStoryV3,
  ParagraphNoteV3,
  ParagraphRoleAssignmentV3,
  StoryBlockV3,
  StoryEvidenceV3,
} from "./types";

// Re-export types so consumers can import from this module (mirrors V2 pattern)
export type {
  PageStoryV3,
  ParagraphNoteV3,
  PageBriefV3,
  BuildPageStoryV3Input,
} from "./types";
export type { ReadingStepV3 } from "./types";
import { segmentPageBlocks } from "./segmentPageBlocks";
import { normalizePageBlocks } from "./normalizePageBlocks";
import { classifyPageType } from "./classifyPageType";
import { classifyReadingMode } from "./classifyReadingMode";
import { assignParagraphSalience } from "./assignParagraphSalience";
import { buildParagraphNotesV3 } from "./buildParagraphNotesV3";
import { buildReadingPath } from "./buildReadingPath";
import { buildHighlightPlan } from "./buildHighlightPlan";
import { bestCompleteSentence, canonicalTextKey, sentenceSafeSupport } from "./textCleanup";

// ---------------------------------------------------------------------------
// Page brief
// ---------------------------------------------------------------------------

const PAGE_PURPOSE_BY_MODE: Record<PageReadingMode, string> = {
  concept_page:    "Defining a concept",
  clinical_page:   "Teaching clinical reasoning",
  form_page:       "Presenting a structured form",
  diagram_page:    "Describing a visual or diagram",
  narrative_page:  "Describing a case or sequence",
  reference_page:  "Providing reference data",
};

function computeBriefStatus(
  notes: ParagraphNoteV3[],
  pageClass: PageClass,
): PageBriefStatusV3 {
  if (pageClass === "frontmatter" || pageClass === "image_only") return "non_body_page";
  if (pageClass === "sparse_text")                                return "weak";
  if (notes.length === 0)                                         return "weak";
  return "ready";
}

function buildPageBrief(
  notes: ParagraphNoteV3[],
  readingMode: PageReadingMode,
  pageClass: PageClass,
): PageBriefV3 {
  const status = computeBriefStatus(notes, pageClass);

  // Bottom line: prefer an "important" note with read_first priority,
  // fall back to first important note, then first note of any kind.
  const bottomLineNote =
    notes.find((n) => n.kind === "important" && n.priority === "read_first") ??
    notes.find((n) => n.kind === "important") ??
    notes[0];

  const pageBottomLine = bottomLineNote?.summarySentence ?? "";
  const pagePurpose    = PAGE_PURPOSE_BY_MODE[readingMode];

  return { pageBottomLine, pagePurpose, currentPageStatus: status };
}

// ---------------------------------------------------------------------------
// Story block synthesis from paragraph notes
// ---------------------------------------------------------------------------

/**
 * Finds the first paragraph note matching a predicate and converts it to a
 * StoryBlockV3. Support sentences come from other notes in the list.
 */
function makeStoryBlock(
  id: string,
  kind: StoryBlockV3["kind"],
  pageNumber: number,
  primaryNote: ParagraphNoteV3,
  supportNotes: ParagraphNoteV3[],
): StoryBlockV3 {
  const supportTexts = sentenceSafeSupport(
    supportNotes
      .filter((n) => n.sourceBlockId !== primaryNote.sourceBlockId)
      .map((n) => n.summarySentence),
    2,
  );

  const evidence: StoryEvidenceV3[] = [primaryNote, ...supportNotes.slice(0, 2)].map((n) => ({
    blockId:    n.sourceBlockId,
    pageNumber: n.pageNumber,
    sentence:   n.summarySentence,
  }));

  return {
    id,
    kind,
    pageNumber,
    sourceBlockId: primaryNote.sourceBlockId,
    text:          primaryNote.summarySentence,
    support:       supportTexts,
    evidence,
  };
}

function synthesizeStoryBlocks(
  notes: ParagraphNoteV3[],
  truthKey: string,
  pageNumber: number,
): Pick<PageStoryV3, "signalBlock" | "ruleBlock" | "mechanismBlock" | "actionBlock" | "trapBlock" | "bottomLineBlock"> {
  const seen = new Set<string>();

  function pickFirst(
    predicate: (n: ParagraphNoteV3) => boolean,
  ): ParagraphNoteV3 | null {
    return notes.find((n) => predicate(n) && !seen.has(canonicalTextKey(n.summarySentence))) ?? null;
  }

  function claim(note: ParagraphNoteV3 | null): ParagraphNoteV3 | null {
    if (!note) return null;
    seen.add(canonicalTextKey(note.summarySentence));
    return note;
  }

  // Support notes = read_later / additional, used as context within blocks
  const supportPool = notes.filter((n) =>
    n.kind === "support" || n.kind === "additional"
  );

  // Signal: most salient "important" note
  const signalNote = claim(pickFirst((n) => n.kind === "important" && n.priority === "read_first"))
    ?? claim(pickFirst((n) => n.kind === "important"));

  // Rule: first "support" note with decision intent
  const ruleNote = claim(pickFirst((n) => n.intent === "apply_rule"));

  // Mechanism: first "support" note with store_support intent
  const mechNote = claim(pickFirst((n) => n.intent === "store_support" && n.kind === "support"));

  // Action: reuse rule if exists, else first "support" note
  const actionNote = ruleNote
    ? null // action and rule from same source — suppressed to avoid duplication
    : claim(pickFirst((n) => n.kind === "support"));

  // Trap: first "warning" note
  const trapNote = claim(pickFirst((n) => n.kind === "warning"));

  // Bottom line: explicitly a bottom-line note, else most salient important note that isn't signal
  const bottomLineNote = claim(
    pickFirst((n) => n.operatorLabel === "Bottom line")
    ?? (signalNote ? pickFirst((n) => n.kind === "important") : null)
  );

  const signalBlock = signalNote
    ? makeStoryBlock(`${truthKey}:signal`, "signal", pageNumber, signalNote, supportPool.slice(0, 2))
    : null;

  const ruleBlock = ruleNote
    ? makeStoryBlock(`${truthKey}:rule`, "rule", pageNumber, ruleNote, supportPool.slice(0, 1))
    : null;

  const mechanismBlock = mechNote
    ? makeStoryBlock(`${truthKey}:mechanism`, "mechanism", pageNumber, mechNote, supportPool.slice(0, 1))
    : null;

  const actionBlock = actionNote
    ? makeStoryBlock(`${truthKey}:action`, "action", pageNumber, actionNote, [])
    : ruleNote
    ? makeStoryBlock(`${truthKey}:action`, "action", pageNumber, ruleNote, [])
    : null;

  const trapBlock = trapNote
    ? makeStoryBlock(`${truthKey}:trap`, "trap", pageNumber, trapNote, [])
    : null;

  const bottomLineBlock = bottomLineNote
    ? makeStoryBlock(`${truthKey}:bottom-line`, "bottom_line", pageNumber, bottomLineNote, [])
    : signalBlock
    ? { ...signalBlock, id: `${truthKey}:bottom-line`, kind: "bottom_line" as const }
    : null;

  return {
    signalBlock,
    ruleBlock,
    mechanismBlock,
    actionBlock,
    trapBlock,
    bottomLineBlock,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildPageStoryV3(input: BuildPageStoryV3Input): PageStoryV3 {
  // Pass 1 — orient
  const rawBlocks        = segmentPageBlocks(input.pageText, input.layoutBlocks);
  const normalizedBlocks = normalizePageBlocks(rawBlocks);
  const pageClass        = classifyPageType(normalizedBlocks);

  // We need v2 paragraph roles for classifyReadingMode and assignParagraphSalience uses
  // its own role computation, so pass empty array as placeholder for roles argument
  // (classifyReadingMode also accepts ParagraphRoleAssignment[] from v2)
  const readingMode = classifyReadingMode(normalizedBlocks, pageClass, []);

  // Pass 2 — detect salience
  const roleAssignments: ParagraphRoleAssignmentV3[] = assignParagraphSalience({
    blocks:      normalizedBlocks,
    pageClass,
    readingMode,
  });

  // Pass 3 — compress into paragraph notes
  const paragraphNotes = buildParagraphNotesV3(normalizedBlocks, roleAssignments);

  // Pass 4 — structure
  const brief       = buildPageBrief(paragraphNotes, readingMode, pageClass);
  const readingPath = buildReadingPath(paragraphNotes);

  // Pass 5 — operationalize
  const storyBlocks   = synthesizeStoryBlocks(paragraphNotes, input.truthKey, input.pageNumber);
  const highlightPlan = buildHighlightPlan(paragraphNotes, input.pageNumber);

  return {
    truthKey:    input.truthKey,
    documentId:  input.documentId,
    pageNumber:  input.pageNumber,
    pageClass,
    readingMode,
    brief,
    paragraphRoleAssignments: roleAssignments,
    paragraphNotes,
    readingPath,
    ...storyBlocks,
    highlightPlan,
  };
}

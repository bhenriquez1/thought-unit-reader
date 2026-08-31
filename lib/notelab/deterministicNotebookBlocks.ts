// lib/notelab/deterministicNotebookBlocks.ts
// NU3 (NoteLab Unification correction) — "Migrate current Study Page content
// into tldraw... transform into tldraw primitives. Preserve only useful
// semantic content and provenance, not old card geometry" and "build a
// deterministic non-AI inclusion/fallback path so this content is never
// silently lost."
//
// Two kinds of real content the AI-driven NotebookPlanner (notebookPlanner.ts)
// never produces, because neither comes from a page's canonical thought
// units at all:
//   - the student's OWN free-text notes (UltraNote.studentNotes)
//   - the retired Study Page's canonical sections (getCanonicalNotebookSections
//     in ultraNoteStore.ts — Big Idea/Key Facts/Mechanism/etc., itself
//     already a deterministic, non-AI reorganization of a note's legacy
//     fields, e.g. sections/professorNotes/concepts/memoryShortcuts/miniTest)
// This file turns both into real FinalizedNotebookBlocks with
// generatedFrom: "student"/"derived" — the two provenance values
// notebookScene.ts already defined but no code path ever set — so
// NotebookCanvas can render them as real primitives. Never AI-generated, so
// never gated on AI succeeding and never lost if AI synthesis fails or never
// ran (e.g. zero canonical units for the page).

import type { UltraNote } from "./ultraNoteStore";
import { getCanonicalNotebookSections } from "./ultraNoteStore";
import { VisualNotebookSceneSchema, type FinalizedNotebookBlock, type VisualNotebookScene } from "./notebookScene";

// Below notebookPlanner.ts's own COMPOSED_BLOCK_CONFIDENCE (0.6) for AI
// blocks — this is a mechanical reorganization of the student's already-
// saved fields, not a fresh judgment call about the source material.
const DERIVED_CONFIDENCE = 0.5;
// The student's own words are ground truth — nothing to verify against.
const STUDENT_CONFIDENCE = 1;

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

/** One heading + text block pair per canonical Study Page section — the
 *  exact same content getCanonicalNotebookSections already reorganizes from
 *  a note's legacy fields, now as real notebook primitives instead of a
 *  React SectionsView card. Deterministic ids (keyed on note.id + the
 *  section's own label) so recomposing on every save is idempotent, never
 *  duplicating a section that hasn't changed. */
export function buildDerivedSectionBlocks(note: UltraNote, startOrder: number): FinalizedNotebookBlock[] {
  const blocks: FinalizedNotebookBlock[] = [];
  let order = startOrder;

  for (const section of getCanonicalNotebookSections(note)) {
    const idBase = `nb-derived-${note.id}-${slugify(section.label)}`;
    const groupId = `${idBase}-group`;
    blocks.push({
      id: `${idBase}-heading`, primitive: "heading", content: section.label, detail: null,
      groupId, order: order++, sourceUnitIndex: -1, relationshipKind: null,
      canonicalUnitId: null, sourceId: note.documentId ?? null, page: note.pageNumber,
      confidence: DERIVED_CONFIDENCE, generatedFrom: "derived",
    });
    blocks.push({
      id: `${idBase}-text`, primitive: "text", content: section.content, detail: null,
      groupId, order: order++, sourceUnitIndex: -1, relationshipKind: null,
      canonicalUnitId: null, sourceId: note.documentId ?? null, page: note.pageNumber,
      confidence: DERIVED_CONFIDENCE, generatedFrom: "derived",
    });
  }
  return blocks;
}

/** The student's own free-text notes, as one handwritten_text block — that
 *  primitive already renders in the notebook's own handwriting font
 *  (notebookShapeSpec.ts), reading as a genuinely personal page rather than
 *  typed AI prose. Null when the student hasn't written anything — never an
 *  empty block placeholding for future content. */
export function buildStudentNoteBlock(note: UltraNote, order: number): FinalizedNotebookBlock | null {
  const text = note.studentNotes?.trim();
  if (!text) return null;
  return {
    id: `nb-student-${note.id}`, primitive: "handwritten_text", content: text, detail: null,
    groupId: null, order, sourceUnitIndex: -1, relationshipKind: null,
    canonicalUnitId: null, sourceId: note.documentId ?? null, page: note.pageNumber,
    confidence: STUDENT_CONFIDENCE, generatedFrom: "student",
  };
}

/** All deterministic (non-AI) content for a note, ordered to append AFTER
 *  any AI-composed blocks a caller already has (startOrder) — the student's
 *  own words lead, followed by the migrated Study Page sections. A note
 *  with nothing to migrate (no sections resolve, no studentNotes) simply
 *  returns []; callers must not treat that as an error. */
export function buildDeterministicNotebookBlocks(note: UltraNote, startOrder = 0): FinalizedNotebookBlock[] {
  let order = startOrder;
  const blocks: FinalizedNotebookBlock[] = [];
  const studentBlock = buildStudentNoteBlock(note, order);
  if (studentBlock) { blocks.push(studentBlock); order += 1; }
  blocks.push(...buildDerivedSectionBlocks(note, order));
  return blocks;
}

/** Merges a note's current deterministic content into a scene, keeping only
 *  the AI-composed blocks of any existing scene (`scene?.blocks` filtered to
 *  `generatedFrom === "ai"`) and rebuilding every derived/student block from
 *  scratch off the note's CURRENT fields. This is what makes the merge
 *  idempotent and always up to date without any per-block diffing: an edit
 *  to studentNotes or to a legacy section field is reflected the next time
 *  this runs, and it never accumulates stale copies alongside the fresh
 *  ones. AI blocks are never touched here — only ever replaced by a real AI
 *  regeneration (notebookPlanner.ts's own generateNotebookScene). */
export function mergeDeterministicContentIntoScene(
  scene: VisualNotebookScene | null,
  note: UltraNote,
  opts: { bookId: string; pageNumber: number },
): VisualNotebookScene {
  const aiBlocks = scene?.blocks.filter((b) => b.generatedFrom === "ai") ?? [];
  const maxOrder = aiBlocks.reduce((max, b) => Math.max(max, b.order), -1);
  const derivedBlocks = buildDeterministicNotebookBlocks(note, maxOrder + 1);

  return VisualNotebookSceneSchema.parse({
    id: scene?.id ?? `nbscene-${opts.bookId}-p${opts.pageNumber}-${Date.now()}`,
    bookId: opts.bookId,
    pageNumber: opts.pageNumber,
    teachingStructure: scene?.teachingStructure ?? null,
    blocks: [...aiBlocks, ...derivedBlocks],
    builtAt: Date.now(),
  });
}

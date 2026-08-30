// lib/notelab/lessonToNotebookScene.ts
// N5 — deterministically recomposes an already-taught, already-persisted
// WhiteboardLessonSnapshot (lib/knowledge/whiteboardLessonSnapshotStore.ts)
// into a VisualNotebookScene (N2), preserving the lesson's real captured
// geometry — which shapes/labels/arrows Professor actually drew, per step.
//
// M3 — this deterministic recomposition is no longer "Save to NoteLab"'s
// primary path. The correction that started the M1-M8 phase explicitly
// called this out: saving a lesson must NOT "simply duplicate the
// Whiteboard canvas" — it must extract the lesson's DURABLE KNOWLEDGE and
// let the real AI synthesis pipeline (notebookPlanner.ts's
// generateNotebookScene) reorganize it alongside the page's canonical
// thought units and whatever notebook content already existed there. That
// live path now runs first (see WhiteboardPanel.tsx's handleSaveToNoteLab);
// buildNotebookSceneFromLessonSnapshot below still exists, still works, and
// is still exercised — as the deterministic FALLBACK when the live call
// fails (network, rate limit, malformed output) or when there are no
// canonical thought units to ground a real synthesis in. A real, if less
// intelligently organized, scene beats none.
//
// extractLessonNarration is the bridge to the new primary path — it pulls
// just the SPOKEN/WRITTEN content out of a snapshot (never the shape
// geometry) as plain strings, the professorExplanation
// notebookPlanner.ts's NoteSynthesisSources expects.
//
// No AI call in THIS file — every primitive choice in
// buildNotebookSceneFromLessonSnapshot is a deterministic mapping from data
// Professor Whiteboard already captured (TeachingStepShape.kind,
// TeachingStepArrow.relationshipKind) — the same "AI proposes meaning,
// deterministic code resolves geometry/provenance" split
// notebookPlanner.ts's finalizeNotebookScene uses for its own (AI-driven)
// path, except here nothing is AI-authored at all, so every block's
// generatedFrom is "derived", never "ai".
//
// Grounding-required primitives (highlight/underline/source_anchor) are
// never emitted here — a lesson step's shapes/labels/narration are
// Professor's OWN composed teaching, not verbatim source quotes, so holding
// them to the verbatim-quote grounding bar would be the wrong contract, not
// a stricter one. teachingStructure is always null: WhiteboardLessonSnapshot
// only carries `visualGrammar` (a different, coarser enum — flow/anatomy/
// pathway/worked-solution/timeline/system-diagram/case-map — than
// TeachingStructure's 17 values), and guessing one from the other would be
// exactly the kind of invented provenance this pipeline never does.

import type {
  TeachingStepShape, TeachingStepLabel, TeachingStepArrow, TeachingStepSummary, WhiteboardLessonSnapshot,
} from "@/lib/knowledge/whiteboardLessonSnapshotStore";
import type { RelationshipKind } from "@/lib/whiteboard/professorLessonPlan";
import {
  VisualNotebookSceneSchema, type VisualNotebookScene, type FinalizedNotebookBlock, type NotebookPrimitive,
} from "@/lib/notelab/notebookScene";

// A drawn shape's own visual form maps directly to a notebook primitive —
// box (the ordinary "concept node" shape) reads as a small diagram element;
// diamond/hexagon/cloud (decision points, traps, warnings — see
// buildProfessorTeachingActions.ts's shapeKindForNode) all read as a
// callout, matching NotebookPrimitive's own definition of callout as "a
// warning, exception, or high-yield note"; circle (a term/value node) reads
// as a short label; brace/line (grouping/separator marks, not standalone
// content) read as a connector.
const SHAPE_KIND_TO_PRIMITIVE: Record<TeachingStepShape["kind"], NotebookPrimitive> = {
  circle: "label",
  box: "diagram",
  brace: "connector",
  line: "connector",
  diamond: "callout",
  hexagon: "callout",
  cloud: "callout",
};

// causes/leads-to/warns-about are directional (one thing produces or points
// at another) -> arrow; supports/contrasts/part-of are associative, not
// directional -> connector.
const RELATIONSHIP_TO_PRIMITIVE: Record<RelationshipKind, "arrow" | "connector"> = {
  causes: "arrow",
  "leads-to": "arrow",
  "warns-about": "arrow",
  supports: "connector",
  contrasts: "connector",
  "part-of": "connector",
};

const RELATIONSHIP_PHRASE: Record<RelationshipKind, string> = {
  supports: "supports",
  causes: "causes",
  contrasts: "contrasts with",
  "leads-to": "leads to",
  "part-of": "is part of",
  "warns-about": "warns about",
};

// Higher than notebookPlanner.ts's COMPOSED_BLOCK_CONFIDENCE (0.6, a raw AI
// composition) since this content already passed through an actually-taught,
// narrated lesson step — a stronger evidentiary bar — but still below 1
// (never a verified verbatim quote).
const LESSON_DERIVED_CONFIDENCE = 0.75;

function stepHasContent(step: TeachingStepSummary): boolean {
  return !!(step.shapes?.length || step.labels?.length || step.arrows?.length || step.narration || step.misconceptionLabel);
}

interface BuildCtx {
  snapshot: WhiteboardLessonSnapshot;
  pageNumber: number;
  nextId: () => string;
}

function makeBlock(ctx: BuildCtx, fields: { primitive: NotebookPrimitive; content: string; groupId: string; order: number; relationshipKind?: RelationshipKind | null }): FinalizedNotebookBlock {
  return {
    id: ctx.nextId(),
    primitive: fields.primitive,
    content: fields.content,
    detail: null,
    groupId: fields.groupId,
    order: fields.order,
    sourceUnitIndex: -1,
    relationshipKind: fields.relationshipKind ?? null,
    // No reliable per-shape thought-unit resolution exists from the
    // snapshot alone (TeachingStepShape/Label/Arrow carry only shapeId/
    // targetId — a VSG node id, not a CanonicalThoughtUnit id) — never
    // guessed. sourceId/page are page-level provenance, which genuinely
    // does apply to every block on this page.
    canonicalUnitId: null,
    sourceId: ctx.snapshot.documentId,
    page: ctx.snapshot.pageNumber ?? ctx.pageNumber,
    confidence: LESSON_DERIVED_CONFIDENCE,
    generatedFrom: "derived",
  };
}

/** One teaching step's shapes/labels/arrows/narration/misconception,
 *  composed into a single groupId cluster so notebookLayout.ts's grouping
 *  (anchor/chain/comparison/stack) treats the whole step as one visual
 *  unit — exactly like a diagram's several label/arrow blocks already do
 *  for an AI-planned page. */
function buildStepBlocks(ctx: BuildCtx, step: TeachingStepSummary): FinalizedNotebookBlock[] {
  const groupId = `lesson-step-${step.stepId}`;
  const base = step.stepId * 1000;
  let cursor = 0;
  const blocks: FinalizedNotebookBlock[] = [];

  blocks.push(makeBlock(ctx, { primitive: "heading", content: step.label, groupId, order: base + cursor++ }));

  // A shape and its label are separate drawn actions sharing the same
  // targetId (the VSG node both represent) — matched here so a labeled
  // shape becomes ONE block carrying the label's real text, not a shape
  // block with no content plus a redundant standalone label block.
  const labelByTargetId = new Map<string, TeachingStepLabel>();
  for (const label of step.labels ?? []) {
    if (label.targetId) labelByTargetId.set(label.targetId, label);
  }
  const matchedLabelShapeIds = new Set<string>();
  const shapeBlockByTargetId = new Map<string, FinalizedNotebookBlock>();

  for (const shape of step.shapes ?? []) {
    const matchedLabel = shape.targetId ? labelByTargetId.get(shape.targetId) : undefined;
    if (matchedLabel) matchedLabelShapeIds.add(matchedLabel.shapeId);
    const block = makeBlock(ctx, {
      primitive: SHAPE_KIND_TO_PRIMITIVE[shape.kind],
      content: matchedLabel?.text ?? step.label,
      groupId, order: base + cursor++,
    });
    blocks.push(block);
    if (shape.targetId) shapeBlockByTargetId.set(shape.targetId, block);
  }

  // Any label never matched to a shape (a caption drawn on its own) still
  // becomes its own block — never silently dropped.
  for (const label of step.labels ?? []) {
    if (matchedLabelShapeIds.has(label.shapeId)) continue;
    blocks.push(makeBlock(ctx, { primitive: "label", content: label.text, groupId, order: base + cursor++ }));
  }

  const lastContentOrder = base + cursor - 1;
  for (const arrow of step.arrows ?? []) {
    const primitive: NotebookPrimitive = arrow.relationshipKind ? RELATIONSHIP_TO_PRIMITIVE[arrow.relationshipKind] : "connector";
    const content = arrow.relationshipKind ? RELATIONSHIP_PHRASE[arrow.relationshipKind] : "connects to";
    // An arrow's targetId names the VSG node it points AT — placing the
    // arrow's order just before that shape's own order makes
    // notebookLayout.ts's connector resolution (nearest preceding/
    // following non-connector sibling by order) resolve `to` as exactly
    // that shape, `from` as whatever content immediately precedes it.
    // Falls back to right after everything already placed when no target
    // matched (still resolves to SOME pair in this step, never a stale
    // cross-step endpoint).
    const targetBlock = arrow.targetId ? shapeBlockByTargetId.get(arrow.targetId) : undefined;
    const order = targetBlock ? targetBlock.order - 0.5 : lastContentOrder + 0.5;
    blocks.push(makeBlock(ctx, { primitive, content, groupId, order, relationshipKind: arrow.relationshipKind ?? null }));
  }

  if (step.narration) blocks.push(makeBlock(ctx, { primitive: "text", content: step.narration, groupId, order: base + 900 }));
  if (step.misconceptionLabel) blocks.push(makeBlock(ctx, { primitive: "callout", content: step.misconceptionLabel, groupId, order: base + 950 }));

  return blocks;
}

/**
 * Recomposes a completed lesson's captured geometry into a VisualNotebookScene.
 * Pure and deterministic — the same snapshot always produces the same scene.
 * A step that drew and said nothing (shouldn't normally happen, but not
 * assumed impossible) contributes no blocks at all, never a bare "Step N"
 * heading standing in for content that was never actually taught.
 */
export function buildNotebookSceneFromLessonSnapshot(
  snapshot: WhiteboardLessonSnapshot,
  opts: { bookId: string; pageNumber: number },
): VisualNotebookScene {
  let ordinal = 0;
  const ctx: BuildCtx = { snapshot, pageNumber: opts.pageNumber, nextId: () => `nb-${opts.bookId}-p${opts.pageNumber}-${ordinal++}` };

  const blocks: FinalizedNotebookBlock[] = [];
  for (const step of snapshot.teachingSteps) {
    if (!stepHasContent(step)) continue;
    blocks.push(...buildStepBlocks(ctx, step));
  }

  return VisualNotebookSceneSchema.parse({
    id: `nbscene-${opts.bookId}-p${opts.pageNumber}-${Date.now()}`,
    bookId: opts.bookId,
    pageNumber: opts.pageNumber,
    teachingStructure: null,
    blocks,
    builtAt: Date.now(),
  });
}

/**
 * M3 — pulls a completed lesson's SPOKEN/WRITTEN content out of its
 * snapshot as plain strings: notebookPlanner.ts's NoteSynthesisSources
 * expects professorExplanation, the durable-knowledge bridge into the real
 * AI synthesis path. Deliberately narration only — never shape geometry
 * (that's buildNotebookSceneFromLessonSnapshot's own, separate job) — since
 * geometry has no meaning as prompt text; the spoken explanation does. A
 * step with no narration contributes nothing (never a bare step label
 * standing in for content that was never actually said).
 */
export function extractLessonNarration(snapshot: WhiteboardLessonSnapshot): string[] {
  return snapshot.teachingSteps
    .filter((step) => step.narration.trim())
    .map((step) => `${step.label}: ${step.narration.trim()}`);
}

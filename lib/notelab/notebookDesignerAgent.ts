// lib/notelab/notebookDesignerAgent.ts
// ND1 — the NoteLab Designer Agent's narrow mission: judge whether a
// freshly-generated VisualNotebookScene is good enough, and if not, ask for
// ONE corrective retry with concrete feedback. Modeled on the Whiteboard
// Artist Agent's accept/reject discipline (lib/whiteboard/whiteboardArtistAgent.ts)
// but deliberately lighter: NoteLab's single AI call already has a ~28s
// per-attempt timeout and a worst-case ~57s round trip against a 60s
// serverless ceiling (pages/api/notebook-plan.ts), so a bounded 3-pass loop
// like Whiteboard's would risk stacking that latency 3x. This module never
// retries more than once, and only inside the already-async background
// compose path (lib/notelab/composeNotebookScene.ts) — it never blocks the
// initial "Save to NoteLab" action a student is waiting on.
//
// Before this module, NoteLab had no quality signal for a generated scene
// at all: composeNoteNotebookSceneInBackground accepted whatever
// generateNotebookScene returned, or fell back to a deterministic scene
// only on an outright thrown error. A scene that generated successfully but
// was thin (1-2 bare text blocks), or lost most of its content to
// finalizeNotebookScene's silent grounding-drop `continue`, was
// indistinguishable from a genuinely good one — nothing measured it, and
// nothing retried it.
//
// Like whiteboardArtistAgent.ts, the actual AI call and deterministic
// resolution stay the caller's job (injected as `generate`) — this module
// never touches fetch, IndexedDB, or React state directly.

import type { NotebookPlan } from "@/lib/notelab/notebookPlanner";
import type { VisualNotebookScene, NotebookPrimitive } from "@/lib/notelab/notebookScene";

// A page's material genuinely might call for only a couple of blocks, but
// the planner's own system prompt already sets this expectation ("A sparse
// page might use 2-3 blocks") — this function is only ever invoked when
// there IS real source material (the zero-canonical-units case never
// reaches AI generation at all, see composeNotebookScene.ts), so anything
// below this floor means the model collapsed real content into almost
// nothing, not that the page genuinely had nothing to say.
export const MIN_FINALIZED_BLOCKS = 2;
// Both conditions must hold, mirroring Whiteboard's own dual floor+ratio
// checks (computeVisualDensityDiagnostic) — a single innocuous grounding
// miss isn't a systemic problem, but losing at least 2 blocks AND at least
// half of everything proposed means the model's citations were unreliable
// across the response, not a one-off.
export const GROUNDING_DROP_COUNT_FLOOR = 2;
export const GROUNDING_DROP_RATIO_CEILING = 0.5;
// Mirrors VISUAL_RICHNESS_RATIO_FLOOR/VISUAL_RICHNESS_COUNT_FLOOR's own
// "ratio OR count, whichever is looser" shape — a scene built almost
// entirely from bare text/heading blocks is the NoteLab equivalent of a
// Whiteboard step built almost entirely from empty containers: technically
// present, not actually doing the material justice.
export const RICHNESS_RATIO_FLOOR = 0.3;
export const RICH_PRIMITIVE_COUNT_FLOOR = 2;

// The two primitives that carry no distinct visual form of their own — see
// notebookScene.ts's NotebookPrimitiveSchema doc comments. Every other
// primitive (diagram/table/timeline/flow/comparison/formula/example/...) is
// "rich" by this measure.
const THIN_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set(["text", "heading"]);

export type NotebookDesignerRejectReason = "too_few_blocks" | "high_grounding_drop_rate" | "low_richness";

export interface NotebookSceneQualityDiagnostic {
  proposedBlockCount: number;
  finalizedBlockCount: number;
  /** Blocks the model proposed that finalizeNotebookScene silently dropped
   *  — almost always a failed grounding check on a highlight/underline/
   *  source_anchor block. Previously invisible: nothing counted this before. */
  droppedBlockCount: number;
  groundingDropRatio: number;
  richPrimitiveCount: number;
  thinPrimitiveCount: number;
  richnessRatio: number;
  passed: boolean;
  rejectReasons: NotebookDesignerRejectReason[];
}

/** Pure — no network, no IDB, no React. Judges an already-finalized scene
 *  against its own originating plan (needed to compute the grounding-drop
 *  rate, since finalizeNotebookScene never reports how much it discarded). */
export function computeNotebookSceneQualityDiagnostic(
  plan: NotebookPlan,
  scene: VisualNotebookScene,
): NotebookSceneQualityDiagnostic {
  const proposedBlockCount = plan.blocks.length;
  const finalizedBlockCount = scene.blocks.length;
  const droppedBlockCount = Math.max(0, proposedBlockCount - finalizedBlockCount);
  const groundingDropRatio = proposedBlockCount > 0 ? droppedBlockCount / proposedBlockCount : 0;

  const richPrimitiveCount = scene.blocks.filter((b) => !THIN_PRIMITIVES.has(b.primitive)).length;
  const thinPrimitiveCount = finalizedBlockCount - richPrimitiveCount;
  const richnessRatio = finalizedBlockCount > 0 ? richPrimitiveCount / finalizedBlockCount : 0;

  const rejectReasons: NotebookDesignerRejectReason[] = [];
  if (finalizedBlockCount < MIN_FINALIZED_BLOCKS) {
    rejectReasons.push("too_few_blocks");
  }
  if (droppedBlockCount >= GROUNDING_DROP_COUNT_FLOOR && groundingDropRatio >= GROUNDING_DROP_RATIO_CEILING) {
    rejectReasons.push("high_grounding_drop_rate");
  }
  if (
    finalizedBlockCount > 0
    && richnessRatio < RICHNESS_RATIO_FLOOR
    && richPrimitiveCount < RICH_PRIMITIVE_COUNT_FLOOR
  ) {
    rejectReasons.push("low_richness");
  }

  return {
    proposedBlockCount, finalizedBlockCount, droppedBlockCount, groundingDropRatio,
    richPrimitiveCount, thinPrimitiveCount, richnessRatio,
    passed: rejectReasons.length === 0,
    rejectReasons,
  };
}

/** Turns a failing diagnostic into the concrete correction text
 *  notebookPlanner.ts's buildNotebookPlannerUserPrompt appends as
 *  correctionFeedback — specific enough that a blind identical retry isn't
 *  the only thing the model can do differently. */
export function buildNotebookDesignerCorrectionFeedback(diagnostic: NotebookSceneQualityDiagnostic): string {
  const lines: string[] = [];
  if (diagnostic.rejectReasons.includes("too_few_blocks")) {
    lines.push(`Your attempt produced only ${diagnostic.finalizedBlockCount} block(s). This page's material supports more than that — compose the distinct primitives that genuinely fit what the source thought units say, rather than collapsing everything into one or two blocks.`);
  }
  if (diagnostic.rejectReasons.includes("high_grounding_drop_rate")) {
    lines.push(`${diagnostic.droppedBlockCount} of your ${diagnostic.proposedBlockCount} proposed blocks were discarded because their highlight/underline/source_anchor content was not a verbatim, character-for-character match to the source thought unit you cited. Quote EXACTLY from the numbered unit — no paraphrasing, no cleanup, no added or removed words.`);
  }
  if (diagnostic.rejectReasons.includes("low_richness")) {
    lines.push(`Your attempt relied almost entirely on plain text/heading blocks (${diagnostic.thinPrimitiveCount} of ${diagnostic.finalizedBlockCount}). Reconsider whether this material actually calls for richer forms — diagram, table, timeline, flow, comparison, formula, equation_work, example, concept_map, callout — and use whichever genuinely fit, instead of explaining everything as plain prose.`);
  }
  return lines.join("\n\n");
}

export interface NotebookDesignerGenerateResult {
  plan: NotebookPlan;
  scene: VisualNotebookScene;
}

export interface NotebookDesignerStepDeps {
  /** Runs one full generation pass — the request plus deterministic
   *  finalization — optionally with corrective feedback from a prior
   *  failing pass (null on the first pass). The caller owns the actual
   *  network call and provenance resolution; this module only decides
   *  whether the result is good enough and whether to ask for one more. */
  generate: (correctionFeedback: string | null) => Promise<NotebookDesignerGenerateResult>;
}

export interface NotebookDesignerStepResult {
  scene: VisualNotebookScene;
  diagnostic: NotebookSceneQualityDiagnostic;
  /** True once the corrective retry pass ran, regardless of whether it then
   *  passed — observability only, never read to gate further behavior. */
  retried: boolean;
}

/**
 * The NoteLab Designer Agent's bounded quality check for one composition
 * attempt: generate once, and if the result doesn't clear the accept
 * thresholds, generate exactly one more time with concrete corrective
 * feedback. Always returns the LATEST attempt once a retry has run — even
 * a retry that still doesn't pass typically address the cited problem
 * directly, which a blind identical third attempt would not, and this
 * module deliberately never loops past one retry (see this file's header
 * comment on latency).
 */
export async function runNotebookDesignerStep(
  deps: NotebookDesignerStepDeps,
): Promise<NotebookDesignerStepResult> {
  let result = await deps.generate(null);
  let diagnostic = computeNotebookSceneQualityDiagnostic(result.plan, result.scene);
  let retried = false;

  if (!diagnostic.passed) {
    retried = true;
    console.warn("[NOTELAB_DESIGNER_RETRY]", { rejectReasons: diagnostic.rejectReasons, diagnostic });
    const feedback = buildNotebookDesignerCorrectionFeedback(diagnostic);
    result = await deps.generate(feedback);
    diagnostic = computeNotebookSceneQualityDiagnostic(result.plan, result.scene);
  }

  return { scene: result.scene, diagnostic, retried };
}

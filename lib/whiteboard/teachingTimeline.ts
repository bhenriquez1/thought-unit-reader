// lib/whiteboard/teachingTimeline.ts
// A deterministic, precomputed drawing-performance timeline for the
// Whiteboard — the "recorded professor" model. Generated ONCE from a
// ShapeDef[] (itself deterministic, non-AI — see sceneGraphAdapter.ts) and
// never touched again during playback: Play/Pause/Next/Previous/Restart all
// operate by computing "what should shape X look like at step N" as a PURE
// function of (timeline, stepIndex) — never by incrementally mutating
// whatever state the canvas happens to already be in. That's what makes
// Previous/Next reconstruct the exact same canvas state every time, and
// Restart-then-Play byte-for-byte replay the same performance.
//
// No React, no tldraw Editor, no side effects — fully unit-testable.

import type { ShapeDef } from "./sceneGraphAdapter";
import type { VisualSceneGraph } from "./visualSceneGraph";

// ── Timeline data model ──────────────────────────────────────────────────────

export type DrawingActionType = "draw-stroke" | "reveal-label" | "draw-arrow" | "emphasize" | "pause";

export interface DrawingAction {
  type: DrawingActionType;
  /** Absent only for a bare "pause" action. */
  shapeId?: string;
  durationMs: number;
}

export interface TeachingStep {
  id: string;
  /** Ties this step back to the grounded annotation / PDF anchor it came
   *  from — ShapeDef.sourceId, the same id used for One Brain click-sync and
   *  (for surgeon-sourced entries) buildSurgeonEvidenceId. Falls back to the
   *  shape's own id for entries with no external source (e.g. a bare edge). */
  canonicalUnitId: string;
  narration: string;
  actions: DrawingAction[];
}

export interface TeachingTimeline {
  steps: TeachingStep[];
}

// Per-action-type default pacing — deliberately short: this paces a single
// shape's reveal, not the pause between teaching points (narration length
// naturally paces the latter once TTS is wired to "wait for speech end").
const STROKE_DURATION_MS     = 700;
const LABEL_DURATION_MS      = 400;
const ARROW_DURATION_MS      = 550;

/**
 * Build a TeachingTimeline from an already-built ShapeDef[] (see
 * sceneGraphAdapter.ts's vsgToShapeDefs — already sorted by revealOrder:
 * nodes in importance order, then edges). One TeachingStep per shape: a geo
 * node gets a draw-stroke (outline) then a reveal-label (fill + text)
 * action; an edge gets a single draw-arrow action. Pure and deterministic —
 * the same ShapeDef[] always produces the identical timeline.
 */
export function buildTeachingTimeline(defs: ShapeDef[]): TeachingTimeline {
  const steps: TeachingStep[] = defs.map((def, i) => {
    const shapeId = String(def.id);
    const actions: DrawingAction[] =
      def.type === "geo"
        ? [
            { type: "draw-stroke",  shapeId, durationMs: STROKE_DURATION_MS },
            { type: "reveal-label", shapeId, durationMs: LABEL_DURATION_MS },
          ]
        : [{ type: "draw-arrow", shapeId, durationMs: ARROW_DURATION_MS }];

    return {
      id:              `step-${i}`,
      canonicalUnitId: def.sourceId ?? shapeId,
      narration:       def.narration ?? "",
      actions,
    };
  });
  return { steps };
}

/** Total duration of one step's actions, in ms, before any speed multiplier. */
export function stepDurationMs(step: TeachingStep): number {
  return step.actions.reduce((sum, a) => sum + a.durationMs, 0);
}

// ── Deterministic state reconstruction ───────────────────────────────────────

export interface ShapeVisualState {
  /** 1 = fully drawn/revealed; FAINT_OPACITY = not yet reached in the
   *  timeline ("faint planning marks", never fully invisible). */
  opacity: number;
  /** True only for the shape belonging to the CURRENTLY active step while
   *  actively playing — a transient highlight, not part of the shape's
   *  persisted "drawn" state. */
  emphasized: boolean;
}

export const FAINT_OPACITY = 0.12;

/**
 * Pure reconstruction of every shape's visual state at an exact timeline
 * position. stepIndex === -1 means "before step one" (all shapes faint —
 * the initial "clean board with faint planning marks" state). stepIndex ===
 * steps.length - 1 means the complete, fully-drawn diagram.
 *
 * Called identically by Play's auto-advance, manual Next/Previous, Restart
 * (stepIndex -1), and "Show complete diagram" (stepIndex steps.length - 1)
 * — there is exactly one code path that decides what the canvas should
 * look like, so every entry point is guaranteed consistent with every other.
 */
export function computeVisualStates(
  defs: ShapeDef[],
  stepIndex: number,
  opts: { emphasizeCurrent?: boolean } = {},
): Map<string, ShapeVisualState> {
  const states = new Map<string, ShapeVisualState>();
  defs.forEach((def, i) => {
    const shapeId = String(def.id);
    const drawn = i <= stepIndex;
    states.set(shapeId, {
      opacity:    drawn ? 1 : FAINT_OPACITY,
      emphasized: Boolean(opts.emphasizeCurrent) && i === stepIndex,
    });
  });
  return states;
}

// ── WhiteboardLesson — the frozen, once-generated unit playback operates on ──

/** Enough identity to know whether a lesson needs regenerating — never
 *  compared field-by-field, just carried for diagnostics/tests. */
export interface FrozenLearningContext {
  pageTruthKey?: string;
  /** VisualSceneGraph.id — a deterministic content hash of grammar + sorted
   *  entry ids (see buildVSGId in visualSceneGraph.ts). Unchanged id means
   *  unchanged source content, so an unchanged WhiteboardLesson is correct
   *  to reuse without rebuilding. */
  vsgId: string;
}

export interface WhiteboardLesson {
  sceneGraph:     VisualSceneGraph;
  timeline:       TeachingTimeline;
  sourceSnapshot: FrozenLearningContext;
}

/**
 * Build the complete, once-per-content lesson: scene graph (already built
 * elsewhere, deterministic, non-AI) + its teaching timeline + a frozen
 * identity snapshot. Nothing in here calls OpenAI or any network — the only
 * "generation" happening is pure data transformation of the already-built
 * VisualSceneGraph. Playback (TldrawCanvas's play/pause/next/previous/
 * restart) NEVER calls this again for the same vsg — only a genuine page or
 * active-concept change (a new vsg reference) does.
 */
export function buildWhiteboardLesson(
  vsg: VisualSceneGraph,
  defs: ShapeDef[],
  pageTruthKey?: string,
): WhiteboardLesson {
  return {
    sceneGraph:     vsg,
    timeline:       buildTeachingTimeline(defs),
    sourceSnapshot: { pageTruthKey, vsgId: vsg.id },
  };
}

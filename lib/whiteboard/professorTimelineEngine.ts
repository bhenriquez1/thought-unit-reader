// lib/whiteboard/professorTimelineEngine.ts
// Pure, deterministic execution-state reconstruction for a
// ProfessorLessonPlan's actions[] — replaces lib/whiteboard/teachingTimeline.ts
// (retired; that module's opacity-reveal DrawingAction model was the
// concept-map-that-fades-in behavior this whole engine replaces).
//
// The core guarantee, identical in spirit to the old computeVisualStates:
// computeCanvasStateAtStep(actions, stepIndex) recomputes canvas state FROM
// SCRATCH on every call — it never incrementally mutates a running state — so
// Next/Previous/Restart are exact-state jumps: calling it with the same
// stepIndex always returns an equal result, independent of what indices were
// visited before. That is what makes "Previous restores the exact canvas
// state before the prior action" true by construction rather than by careful
// bookkeeping.
//
// No React, no tldraw Editor — TldrawCanvas.tsx diffs this pure state against
// whatever shapes currently exist and creates/updates/deletes accordingly.

import type { Bounds, Point, ProfessorTeachingAction } from "./professorLessonPlan";

export type ShapeVisualKind = "box" | "circle" | "brace" | "line" | "arrow" | "text" | "diamond" | "hexagon" | "cloud";

export interface ShapeVisualState {
  shapeId: string;
  kind: ShapeVisualKind;
  bounds?: Bounds;
  from?: Point;
  to?: Point;
  /** Phase B2 connector-obstacle-avoidance — see ProfessorTeachingAction's
   *  draw-arrow.bend comment in professorLessonPlan.ts. Only meaningful
   *  when kind === "arrow". */
  bend?: number;
  /** Text-only anchor (used when a shape has no draw-shape backing it, e.g.
   *  the title, which is a bare `write` with no enclosing box). */
  x?: number;
  y?: number;
  /** '' until this shape's `write` action has been reached; full text after. */
  text: string;
  /** Sticky once set — an emphasized point stays circled, it doesn't flash
   *  and revert, matching "circles the high-yield point" as a persistent mark. */
  emphasized: boolean;
  /** EVERY emphasize treatment applied to this shape, in the order their
   *  actions fired — a shape can legitimately be both "the decisive stage"
   *  (circled) AND "step 3 of 5" (numbered) at once, so this accumulates
   *  rather than the later action overwriting the earlier one. */
  emphasisTreatments: Array<{ treatment: "circle" | "underline" | "pulse" | "highlight" | "number" | "crossOut"; sequenceNumber?: number }>;
}

/**
 * Reconstruct exactly what should exist on the canvas after executing
 * actions[0..stepIndex] (inclusive). stepIndex === -1 means "before the
 * first action" — a blank canvas, no teaching-layer shapes at all (the
 * "nearly blank canvas" starting state, not a pre-drawn faint skeleton).
 */
export function computeCanvasStateAtStep(
  actions: ProfessorTeachingAction[],
  stepIndex: number,
): Map<string, ShapeVisualState> {
  const state = new Map<string, ShapeVisualState>();
  const ceiling = Math.min(stepIndex, actions.length - 1);

  for (let i = 0; i <= ceiling; i++) {
    const action = actions[i];

    if (action.type === "draw-shape") {
      const prior = state.get(action.shapeId);
      state.set(action.shapeId, {
        shapeId: action.shapeId,
        kind: action.shape,
        bounds: action.bounds,
        text: prior?.text ?? "",
        emphasized: prior?.emphasized ?? false,
        emphasisTreatments: prior?.emphasisTreatments ?? [],
      });
    } else if (action.type === "draw-arrow") {
      const prior = state.get(action.shapeId);
      state.set(action.shapeId, {
        shapeId: action.shapeId,
        kind: "arrow",
        from: action.from,
        to: action.to,
        bend: action.bend,
        text: prior?.text ?? "",
        emphasized: prior?.emphasized ?? false,
        emphasisTreatments: prior?.emphasisTreatments ?? [],
      });
    } else if (action.type === "write") {
      const prior = state.get(action.shapeId);
      state.set(action.shapeId, {
        shapeId: action.shapeId,
        kind: prior?.kind ?? "text",
        bounds: prior?.bounds,
        from: prior?.from,
        to: prior?.to,
        x: prior?.x ?? action.x,
        y: prior?.y ?? action.y,
        text: action.text,
        emphasized: prior?.emphasized ?? false,
        emphasisTreatments: prior?.emphasisTreatments ?? [],
      });
    } else if (action.type === "emphasize") {
      const prior = state.get(action.targetId);
      if (prior) {
        // Accumulate — don't overwrite. A shape can carry more than one
        // simultaneous treatment (e.g. circled AND numbered). De-duplicate
        // by treatment type so replaying past the same emphasize action
        // twice (impossible in practice, but keeps this idempotent) never
        // double-adds the same badge.
        const withoutSameTreatment = prior.emphasisTreatments.filter(t => t.treatment !== action.treatment);
        state.set(action.targetId, {
          ...prior, emphasized: true,
          emphasisTreatments: [...withoutSameTreatment, { treatment: action.treatment, sequenceNumber: action.sequenceNumber }],
        });
      }
    } else if (action.type === "erase") {
      // Recomputed from scratch every call, same as every other action —
      // simply omitting the entry IS the erase; nothing special to "undo"
      // when a later Previous/Restart jump lands before this action.
      state.delete(action.targetShapeId);
    }
    // speak / pause / move-camera never alter shape state.
  }

  return state;
}

/**
 * The most recent move-camera action's targetIds at or before stepIndex, or
 * null if none has fired yet (renderer should fit the whole canvas in that
 * case). Same "recompute from scratch" determinism as canvas state above.
 */
export function resolveCameraTargetAtStep(
  actions: ProfessorTeachingAction[],
  stepIndex: number,
): string[] | null {
  const ceiling = Math.min(stepIndex, actions.length - 1);
  for (let i = ceiling; i >= 0; i--) {
    const action = actions[i];
    if (action.type === "move-camera") return action.targetIds;
  }
  return null;
}

/** The most recent `speak` action's segmentId at or before stepIndex — used
 *  to drive the side transcript's "currently spoken" highlight. */
export function resolveActiveSegmentIdAtStep(
  actions: ProfessorTeachingAction[],
  stepIndex: number,
): string | null {
  const ceiling = Math.min(stepIndex, actions.length - 1);
  for (let i = ceiling; i >= 0; i--) {
    const action = actions[i];
    if (action.type === "speak") return action.segmentId;
  }
  return null;
}

export function actionDurationMs(action: ProfessorTeachingAction): number {
  return action.durationMs;
}

// ── Phase B2: teaching-step boundaries ──────────────────────────────────────
// A "teaching step" (see ProfessorTeachingAction.stepId's comment in
// professorLessonPlan.ts) is a pedagogical unit — one narrated point, with
// all of its speak/write/draw/connect/emphasize actions sharing one stepId.
// These helpers let Previous/Next navigate by STEP instead of by raw action
// index, without changing computeCanvasStateAtStep's own index-based
// contract (Previous/Next just pick a different index to jump to).

/** The stepId active at stepIndex, or -1 before the first action. */
export function resolveStepIdAtStep(actions: ProfessorTeachingAction[], stepIndex: number): number {
  if (stepIndex < 0 || actions.length === 0) return -1;
  const i = Math.min(stepIndex, actions.length - 1);
  return actions[i].stepId;
}

/** The number of distinct teaching steps in this plan. */
export function totalTeachingSteps(actions: ProfessorTeachingAction[]): number {
  return new Set(actions.map(a => a.stepId)).size;
}

/** The action index of the FIRST action belonging to stepId, or -1 if no
 *  action carries that stepId. */
export function stepStartIndex(actions: ProfessorTeachingAction[], stepId: number): number {
  return actions.findIndex(a => a.stepId === stepId);
}

/** The action index of the LAST action belonging to stepId, or -1 if no
 *  action carries that stepId. */
export function stepEndIndex(actions: ProfessorTeachingAction[], stepId: number): number {
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i].stepId === stepId) return i;
  }
  return -1;
}

/** The action index Next should jump TO — the start of the step whose id is
 *  one greater than the step active at stepIndex, or actions.length - 1
 *  (the very end) if already in the last step. Never throws on an
 *  empty/out-of-range plan. */
export function nextStepIndex(actions: ProfessorTeachingAction[], stepIndex: number): number {
  if (actions.length === 0) return stepIndex;
  const currentStepId = resolveStepIdAtStep(actions, stepIndex);
  const start = stepStartIndex(actions, currentStepId + 1);
  return start >= 0 ? start : actions.length - 1;
}

/** Phase B3 — best-effort: does this step contain a "crossOut" emphasis
 *  (the AI's own "this is a common misconception, debunk it" signal — see
 *  ProfessorNodeScript.emphasisTreatment in professorLessonPlan.ts), and if
 *  so, what's the associated shape's own handwritten text? Reused to fire a
 *  misconception-observed Learning State event without any new interactive
 *  UI — the signal already exists in the plan's own data (Phase B1). Returns
 *  null when the step has no crossOut emphasis, or defensively if the
 *  emphasized shape's write action can't be found. */
export function stepMisconceptionLabel(actions: ProfessorTeachingAction[], stepId: number): string | null {
  const start = stepStartIndex(actions, stepId);
  const end = stepEndIndex(actions, stepId);
  if (start < 0) return null;
  const stepActions = actions.slice(start, end + 1);
  for (const action of stepActions) {
    if (action.type !== "emphasize" || action.treatment !== "crossOut") continue;
    const writeAction = stepActions.find(a => a.type === "write" && a.shapeId === action.targetId);
    if (writeAction && writeAction.type === "write") return writeAction.text;
  }
  return null;
}

/** The action index Previous should jump TO — the start of the PREVIOUS
 *  distinct step (not just stepIndex - 1), or -1 (blank canvas) if already
 *  at or before the first step. */
export function previousStepIndex(actions: ProfessorTeachingAction[], stepIndex: number): number {
  if (actions.length === 0) return -1;
  const currentStepId = resolveStepIdAtStep(actions, stepIndex);
  if (currentStepId <= 0) return -1;
  // If stepIndex is already partway INTO currentStepId (not at its very
  // start), "Previous" first returns to the start of the CURRENT step —
  // exactly like a real Previous button doesn't skip two steps back when
  // you're mid-step. Only jump back an additional step if already sitting
  // at the current step's own start index.
  const currentStart = stepStartIndex(actions, currentStepId);
  if (stepIndex > currentStart) return currentStart;
  const prevStart = stepStartIndex(actions, currentStepId - 1);
  return prevStart >= 0 ? prevStart : -1;
}

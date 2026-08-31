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

import type {
  Bounds, Point, ProfessorFreehandPoint, ProfessorSurface, ProfessorTeachingAction,
  ProfessorVisualStyle, RelationshipKind, TeachingRole,
} from "./professorLessonPlan";

export type ShapeVisualKind = "box" | "circle" | "brace" | "line" | "arrow" | "text" | "diamond" | "hexagon" | "cloud" | "freehand";

export interface ShapeVisualState {
  shapeId: string;
  kind: ShapeVisualKind;
  bounds?: Bounds;
  from?: Point;
  to?: Point;
  points?: ProfessorFreehandPoint[];
  /** Phase B2 connector-obstacle-avoidance — see ProfessorTeachingAction's
   *  draw-arrow.bend comment in professorLessonPlan.ts. Only meaningful
   *  when kind === "arrow". */
  bend?: number;
  /** Semantic connector meaning for AI-authored relationships. Structural
   *  VSG edges keep resolving their kind from targetId at render time. */
  relationshipKind?: RelationshipKind;
  /** Pedagogical role selected by the Professor planner. The renderer maps
   *  this to one stable color vocabulary across every lesson. */
  teachingRole?: TeachingRole;
  /** Runtime-agent presentation metadata. Content remains grounded through
   * targetId; these fields only control how the verified primitive renders. */
  targetId?: string;
  visualStyle?: ProfessorVisualStyle;
  visualRole?: string;
  isPen?: boolean;
  closed?: boolean;
  opacity?: number;
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
        teachingRole: action.teachingRole,
        targetId: action.targetId,
        visualStyle: action.visualStyle,
        visualRole: action.visualRole,
        opacity: action.opacity,
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
        relationshipKind: action.relationshipKind,
        targetId: action.targetId,
        visualStyle: action.visualStyle,
        visualRole: action.visualRole,
        text: prior?.text ?? "",
        emphasized: prior?.emphasized ?? false,
        emphasisTreatments: prior?.emphasisTreatments ?? [],
      });
    } else if (action.type === "draw-freehand") {
      const prior = state.get(action.shapeId);
      state.set(action.shapeId, {
        shapeId: action.shapeId,
        kind: "freehand",
        points: action.points,
        targetId: action.targetId,
        visualStyle: action.visualStyle,
        visualRole: action.visualRole,
        isPen: action.isPen,
        closed: action.closed,
        opacity: action.opacity,
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
        bend: prior?.bend,
        relationshipKind: prior?.relationshipKind,
        teachingRole: prior?.teachingRole,
        targetId: action.targetId ?? prior?.targetId,
        visualStyle: action.visualStyle ?? prior?.visualStyle,
        visualRole: action.visualRole ?? prior?.visualRole,
        opacity: prior?.opacity,
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
  return resolveCameraActionAtStep(actions, stepIndex)?.targetIds ?? null;
}

/** Full intent-aware camera request at or before stepIndex. */
export function resolveCameraActionAtStep(
  actions: ProfessorTeachingAction[],
  stepIndex: number,
): Extract<ProfessorTeachingAction, { type: "move-camera" }> | null {
  const ceiling = Math.min(stepIndex, actions.length - 1);
  for (let i = ceiling; i >= 0; i--) {
    const action = actions[i];
    if (action.type === "move-camera") return action;
  }
  return null;
}

/** Why the surface is what it is at this step — carried straight through
 *  from the plan's own set-surface.reason (see professorLessonPlan.ts),
 *  which buildProfessorTeachingActions.ts already assigns per action but
 *  which no runtime consumer read before stabilization item 2: a real,
 *  more granular phase signal than the bare pdf/whiteboard surface value,
 *  without inventing a new state machine or changing how the plan is built.
 *
 *  "diagnostic" is a fifth value TldrawCanvas.tsx uses OUTSIDE this
 *  resolver — never produced by resolveProfessorSurfaceAtStep itself, only
 *  by TldrawCanvas explicitly forcing the surface to "whiteboard" so a
 *  genuine loading/error/config state stays visible instead of hiding
 *  behind the PDF-first default (see the correction: Professor Mode must
 *  default to the PDF, not to an opaque Whiteboard modal, but a real
 *  failure the student needs to see or retry must never be silently
 *  suppressed by that same default). */
export type ProfessorSurfaceReason = "source-passage" | "visual-lesson" | "return-to-source" | "summary" | "diagnostic";

export function resolveProfessorSurfaceAtStep(
  actions: ProfessorTeachingAction[],
  stepIndex: number,
): { surface: ProfessorSurface; actionId: string; stepId: number; reason: ProfessorSurfaceReason } | null {
  const ceiling = Math.min(stepIndex, actions.length - 1);
  for (let i = ceiling; i >= 0; i--) {
    const action = actions[i];
    if (action.type === "set-surface") {
      return { surface: action.surface, actionId: action.actionId, stepId: action.stepId, reason: action.reason };
    }
  }
  return null;
}

// ── Stabilization item 2: stepNarrationRef decision logic, extracted ───────
// TldrawCanvas.tsx's playSegmentThenAdvance/advanceForPlayback coordinate an
// early-started narration (Phase B2 draw-while-teaching) against the
// timeline pointer's own arrival at the same "speak" action through a
// Map<segmentId, "pending" | "done"> (stepNarrationRef). Both branches of
// that coordination are pure decisions over small, already-known values —
// pulling them out here makes them independently testable without jsdom,
// and is the exact "harden the early-start narration path" fix for
// stabilization item 2, not a rewrite of the advance loop itself (the call
// sites in TldrawCanvas.tsx still own all the React/audio side effects).

/** True narration state as tracked in stepNarrationRef.current; undefined
 *  means the segment was never early-started (or was cleared by
 *  stopNarration on navigation). */
export type StepNarrationState = "pending" | "done" | undefined;

/**
 * Called from playSegmentThenAdvance's onNaturalEnd when a segment that was
 * started via earlyStart finishes playing. Returns true when the timeline
 * pointer has already arrived at the segment's own action index (the
 * drawing finished before the narration did) and so onNaturalEnd should
 * advance the pointer itself right now; false when the pointer hasn't
 * caught up yet, in which case recording "done" is enough — the pointer's
 * own arrival (resolveSpeakArrivalAction, below) will see "done" and
 * continue immediately with nothing left to wait for.
 *
 * A non-early-started segment (earlyStart: false) always advances
 * immediately on its own natural end — this mirrors the original
 * unconditional `advanceForPlaybackRef.current()` call for that case.
 */
export function shouldAdvanceImmediatelyOnNarrationEnd(
  earlyStart: boolean,
  currentPointerIndex: number,
  narrationActionIndex: number,
): boolean {
  if (!earlyStart) return true;
  return currentPointerIndex >= narrationActionIndex;
}

/**
 * Called from advanceForPlayback when the pointer arrives at a "speak"
 * action, given that action's segment's current stepNarrationRef entry.
 * Three-way branch, exactly mirroring the original inline logic:
 *   - "done": the early-started narration already finished (drawing simply
 *     took longer) — nothing left to wait for, advance right now.
 *   - "wait-for-narration": the early-started narration is still playing —
 *     do NOT start a second audio element for the same segment; its own
 *     onNaturalEnd will notice the pointer has caught up and advance.
 *   - "start-narration": this segment was never early-started (a step with
 *     zero/multiple speak actions, or narration was off when the step
 *     began) — fall back to the original on-arrival playback.
 */
export function resolveSpeakArrivalAction(
  narrationState: StepNarrationState,
): "advance-immediately" | "wait-for-narration" | "start-narration" {
  if (narrationState === "done") return "advance-immediately";
  if (narrationState === "pending") return "wait-for-narration";
  return "start-narration";
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

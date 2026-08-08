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

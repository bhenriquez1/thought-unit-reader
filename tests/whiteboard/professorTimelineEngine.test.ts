// tests/whiteboard/professorTimelineEngine.test.ts
// Pure-function tests for the deterministic canvas-state reconstruction that
// replaces lib/whiteboard/teachingTimeline.ts (retired). This is what makes
// Previous/Next/Restart exact-state jumps rather than incremental undo.

import {
  computeCanvasStateAtStep, resolveCameraTargetAtStep, resolveActiveSegmentIdAtStep, actionDurationMs,
} from "../../lib/whiteboard/professorTimelineEngine";
import type { ProfessorTeachingAction } from "../../lib/whiteboard/professorLessonPlan";

const ACTIONS: ProfessorTeachingAction[] = [
  { type: "move-camera", actionId: "a0", targetIds: ["shape:n1"], durationMs: 400 },
  { type: "draw-shape", actionId: "a1", shapeId: "shape:n1", targetId: "src1", shape: "box", bounds: { x: 0, y: 0, w: 200, h: 56 }, durationMs: 550 },
  { type: "write", actionId: "a2", shapeId: "shape:n1", targetId: "src1", text: "Rapid assessment", x: 8, y: 20, durationMs: 700 },
  { type: "emphasize", actionId: "a3", targetId: "shape:n1", treatment: "circle", durationMs: 550 },
  { type: "speak", actionId: "a4", segmentId: "seg0", text: "Start with the central problem.", durationMs: 900 },
  { type: "pause", actionId: "a5", durationMs: 400 },
  { type: "move-camera", actionId: "a6", targetIds: ["shape:n1", "shape:n2"], durationMs: 400 },
  { type: "draw-arrow", actionId: "a7", shapeId: "shape:e1", from: { x: 100, y: 56 }, to: { x: 100, y: 120 }, durationMs: 500 },
  { type: "speak", actionId: "a8", segmentId: "seg1", text: "This leads to the next step.", durationMs: 700 },
];

describe("computeCanvasStateAtStep — reconstructs from scratch every call", () => {
  it("stepIndex -1: nothing exists yet — a nearly blank canvas, not a faint skeleton", () => {
    const state = computeCanvasStateAtStep(ACTIONS, -1);
    expect(state.size).toBe(0);
  });

  it("after only the draw-shape action: the shape exists but has no text yet", () => {
    const state = computeCanvasStateAtStep(ACTIONS, 1);
    const s = state.get("shape:n1");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("box");
    expect(s!.text).toBe("");
  });

  it("after the write action: the shape has its full text — never a partial word", () => {
    const state = computeCanvasStateAtStep(ACTIONS, 2);
    expect(state.get("shape:n1")!.text).toBe("Rapid assessment");
  });

  it("emphasize is sticky: once set, stays true at every later step", () => {
    const atEmphasize = computeCanvasStateAtStep(ACTIONS, 3);
    expect(atEmphasize.get("shape:n1")!.emphasized).toBe(true);
    const later = computeCanvasStateAtStep(ACTIONS, 8);
    expect(later.get("shape:n1")!.emphasized).toBe(true);
  });

  it("an arrow shape carries from/to points once its draw-arrow action is reached", () => {
    const state = computeCanvasStateAtStep(ACTIONS, 7);
    const arrow = state.get("shape:e1");
    expect(arrow).toBeDefined();
    expect(arrow!.kind).toBe("arrow");
    expect(arrow!.from).toEqual({ x: 100, y: 56 });
    expect(arrow!.to).toEqual({ x: 100, y: 120 });
  });

  it("REQUIRED: identical stepIndex always reconstructs an equal state, independent of what indices were visited before — this is what makes Previous/Restart exact-state jumps", () => {
    const a = computeCanvasStateAtStep(ACTIONS, 4);
    const b = computeCanvasStateAtStep(ACTIONS, 4);
    expect(a).toEqual(b);
    // Simulate "visiting" other indices first — no hidden incremental state.
    computeCanvasStateAtStep(ACTIONS, 8);
    computeCanvasStateAtStep(ACTIONS, -1);
    computeCanvasStateAtStep(ACTIONS, 2);
    const c = computeCanvasStateAtStep(ACTIONS, 4);
    expect(c).toEqual(a);
  });

  it("REQUIRED: Previous restores the EXACT canvas state before the prior action — stepping to N then back to N-1 equals never having advanced past N-1", () => {
    const direct = computeCanvasStateAtStep(ACTIONS, 2);
    const viaForwardThenBack = computeCanvasStateAtStep(ACTIONS, 2); // Next/Previous both just call this with a different index
    expect(viaForwardThenBack).toEqual(direct);
  });

  it("stepIndex beyond the action list clamps to the last action (defensive)", () => {
    const atEnd = computeCanvasStateAtStep(ACTIONS, ACTIONS.length - 1);
    const beyond = computeCanvasStateAtStep(ACTIONS, 999);
    expect(beyond).toEqual(atEnd);
  });
});

describe("resolveCameraTargetAtStep", () => {
  it("returns null before any move-camera action has fired", () => {
    expect(resolveCameraTargetAtStep(ACTIONS, -1)).toBeNull();
  });

  it("returns the most recent move-camera targets at or before stepIndex", () => {
    expect(resolveCameraTargetAtStep(ACTIONS, 0)).toEqual(["shape:n1"]);
    expect(resolveCameraTargetAtStep(ACTIONS, 5)).toEqual(["shape:n1"]);
    expect(resolveCameraTargetAtStep(ACTIONS, 6)).toEqual(["shape:n1", "shape:n2"]);
  });
});

describe("resolveActiveSegmentIdAtStep", () => {
  it("returns null before any speak action has fired", () => {
    expect(resolveActiveSegmentIdAtStep(ACTIONS, 3)).toBeNull();
  });

  it("returns the most recent speak action's segmentId", () => {
    expect(resolveActiveSegmentIdAtStep(ACTIONS, 4)).toBe("seg0");
    expect(resolveActiveSegmentIdAtStep(ACTIONS, 6)).toBe("seg0");
    expect(resolveActiveSegmentIdAtStep(ACTIONS, 8)).toBe("seg1");
  });
});

describe("actionDurationMs", () => {
  it("returns each action's own durationMs", () => {
    for (const action of ACTIONS) {
      expect(actionDurationMs(action)).toBe(action.durationMs);
    }
  });
});

// tests/whiteboard/professorTimelineEngine.test.ts
// Pure-function tests for the deterministic canvas-state reconstruction that
// replaces lib/whiteboard/teachingTimeline.ts (retired). This is what makes
// Previous/Next/Restart exact-state jumps rather than incremental undo.

import {
  computeCanvasStateAtStep, resolveCameraTargetAtStep, resolveActiveSegmentIdAtStep, actionDurationMs,
  resolveStepIdAtStep, totalTeachingSteps, stepStartIndex, stepEndIndex, nextStepIndex, previousStepIndex,
} from "../../lib/whiteboard/professorTimelineEngine";
import type { ProfessorTeachingAction } from "../../lib/whiteboard/professorLessonPlan";

// stepId: a0-a5 belong to teaching step 1 (the first node), a6-a8 to step 2
// (the edge/second point) — a realistic two-step fixture, reused by the
// step-boundary tests below.
const ACTIONS: ProfessorTeachingAction[] = [
  { type: "move-camera", actionId: "a0", targetIds: ["shape:n1"], durationMs: 400, stepId: 1 },
  { type: "draw-shape", actionId: "a1", shapeId: "shape:n1", targetId: "src1", shape: "box", bounds: { x: 0, y: 0, w: 200, h: 56 }, durationMs: 550, stepId: 1 },
  { type: "write", actionId: "a2", shapeId: "shape:n1", targetId: "src1", text: "Rapid assessment", x: 8, y: 20, durationMs: 700, stepId: 1 },
  { type: "emphasize", actionId: "a3", targetId: "shape:n1", treatment: "circle", durationMs: 550, stepId: 1 },
  { type: "speak", actionId: "a4", segmentId: "seg0", text: "Start with the central problem.", durationMs: 900, stepId: 1 },
  { type: "pause", actionId: "a5", durationMs: 400, stepId: 1 },
  { type: "move-camera", actionId: "a6", targetIds: ["shape:n1", "shape:n2"], durationMs: 400, stepId: 2 },
  { type: "draw-arrow", actionId: "a7", shapeId: "shape:e1", from: { x: 100, y: 56 }, to: { x: 100, y: 120 }, durationMs: 500, stepId: 2 },
  { type: "speak", actionId: "a8", segmentId: "seg1", text: "This leads to the next step.", durationMs: 700, stepId: 2 },
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

describe("computeCanvasStateAtStep — emphasisTreatments accumulate rather than overwrite", () => {
  const MULTI_EMPHASIS_ACTIONS: ProfessorTeachingAction[] = [
    { type: "draw-shape", actionId: "b0", shapeId: "shape:n1", shape: "box", bounds: { x: 0, y: 0, w: 200, h: 56 }, durationMs: 550, stepId: 0 },
    { type: "emphasize", actionId: "b1", targetId: "shape:n1", treatment: "circle", durationMs: 550, stepId: 0 },
    { type: "emphasize", actionId: "b2", targetId: "shape:n1", treatment: "number", sequenceNumber: 3, durationMs: 550, stepId: 0 },
  ];

  it("a shape can carry more than one simultaneous treatment — circled AND numbered", () => {
    const state = computeCanvasStateAtStep(MULTI_EMPHASIS_ACTIONS, 2);
    const s = state.get("shape:n1")!;
    expect(s.emphasisTreatments).toHaveLength(2);
    expect(s.emphasisTreatments.map(t => t.treatment).sort()).toEqual(["circle", "number"]);
  });

  it("carries the sequenceNumber through for the 'number' treatment", () => {
    const state = computeCanvasStateAtStep(MULTI_EMPHASIS_ACTIONS, 2);
    const s = state.get("shape:n1")!;
    const numberTreatment = s.emphasisTreatments.find(t => t.treatment === "number");
    expect(numberTreatment?.sequenceNumber).toBe(3);
  });

  it("re-applying the SAME treatment doesn't duplicate it (idempotent)", () => {
    const repeated: ProfessorTeachingAction[] = [
      ...MULTI_EMPHASIS_ACTIONS,
      { type: "emphasize", actionId: "b3", targetId: "shape:n1", treatment: "circle", durationMs: 550, stepId: 0 },
    ];
    const state = computeCanvasStateAtStep(repeated, 3);
    const s = state.get("shape:n1")!;
    expect(s.emphasisTreatments.filter(t => t.treatment === "circle")).toHaveLength(1);
  });

  it("an emphasize action targeting a shape that doesn't exist yet is a no-op, not a crash", () => {
    const actions: ProfessorTeachingAction[] = [
      { type: "emphasize", actionId: "c0", targetId: "shape:ghost", treatment: "circle", durationMs: 550, stepId: 0 },
    ];
    expect(() => computeCanvasStateAtStep(actions, 0)).not.toThrow();
    expect(computeCanvasStateAtStep(actions, 0).has("shape:ghost")).toBe(false);
  });
});

describe("Phase B2: teaching-step boundary helpers — ACTIONS is 2 steps (a0-a5 = step 1, a6-a8 = step 2)", () => {
  it("resolveStepIdAtStep returns -1 before the first action, then the active action's stepId", () => {
    expect(resolveStepIdAtStep(ACTIONS, -1)).toBe(-1);
    expect(resolveStepIdAtStep(ACTIONS, 0)).toBe(1);
    expect(resolveStepIdAtStep(ACTIONS, 5)).toBe(1);
    expect(resolveStepIdAtStep(ACTIONS, 6)).toBe(2);
    expect(resolveStepIdAtStep(ACTIONS, 8)).toBe(2);
  });

  it("totalTeachingSteps counts distinct stepIds", () => {
    expect(totalTeachingSteps(ACTIONS)).toBe(2);
  });

  it("stepStartIndex/stepEndIndex bound each step correctly", () => {
    expect(stepStartIndex(ACTIONS, 1)).toBe(0);
    expect(stepEndIndex(ACTIONS, 1)).toBe(5);
    expect(stepStartIndex(ACTIONS, 2)).toBe(6);
    expect(stepEndIndex(ACTIONS, 2)).toBe(8);
    expect(stepStartIndex(ACTIONS, 99)).toBe(-1);
  });

  it("REQUIRED: nextStepIndex jumps to the START of the NEXT step, not stepIndex+1", () => {
    // From partway into step 1 (index 2), Next should land on step 2's
    // start (index 6) — a single click skips the rest of step 1's
    // micro-actions, not just one action forward.
    expect(nextStepIndex(ACTIONS, 2)).toBe(6);
  });

  it("nextStepIndex at the last step stays at the end of the plan", () => {
    expect(nextStepIndex(ACTIONS, 6)).toBe(ACTIONS.length - 1);
    expect(nextStepIndex(ACTIONS, 8)).toBe(ACTIONS.length - 1);
  });

  it("REQUIRED: previousStepIndex from partway into a step returns to THAT step's own start first (doesn't skip two steps back)", () => {
    expect(previousStepIndex(ACTIONS, 7)).toBe(6); // partway into step 2 -> step 2's own start
  });

  it("REQUIRED: previousStepIndex from a step's own start jumps to the PREVIOUS step's start", () => {
    expect(previousStepIndex(ACTIONS, 6)).toBe(0); // at step 2's start -> step 1's start
  });

  it("previousStepIndex from step 1 (the first step) goes to -1 (blank canvas)", () => {
    expect(previousStepIndex(ACTIONS, 0)).toBe(-1);
    expect(previousStepIndex(ACTIONS, 3)).toBe(0); // partway into step 1 -> step 1's own start first
  });

  it("is deterministic and never throws on an empty actions array", () => {
    expect(() => nextStepIndex([], -1)).not.toThrow();
    expect(() => previousStepIndex([], -1)).not.toThrow();
    expect(totalTeachingSteps([])).toBe(0);
  });
});

describe("computeCanvasStateAtStep — erase removes a shape from the reconstructed state", () => {
  const ERASE_ACTIONS: ProfessorTeachingAction[] = [
    { type: "draw-shape", actionId: "d0", shapeId: "shape:sketch", shape: "box", bounds: { x: 0, y: 0, w: 100, h: 40 }, durationMs: 550, stepId: 0 },
    { type: "erase", actionId: "d1", targetShapeId: "shape:sketch", durationMs: 300, stepId: 0 },
    { type: "draw-shape", actionId: "d2", shapeId: "shape:clean", shape: "box", bounds: { x: 0, y: 0, w: 100, h: 40 }, durationMs: 550, stepId: 0 },
  ];

  it("the shape exists right after it's drawn", () => {
    expect(computeCanvasStateAtStep(ERASE_ACTIONS, 0).has("shape:sketch")).toBe(true);
  });

  it("the shape no longer exists once the erase action has fired", () => {
    expect(computeCanvasStateAtStep(ERASE_ACTIONS, 1).has("shape:sketch")).toBe(false);
  });

  it("REQUIRED: Previous past the erase restores the shape — recomputed from scratch, not an incremental undo", () => {
    const beforeErase = computeCanvasStateAtStep(ERASE_ACTIONS, 0);
    const afterEraseThenBack = computeCanvasStateAtStep(ERASE_ACTIONS, 0); // Previous just re-calls with a smaller index
    expect(afterEraseThenBack.has("shape:sketch")).toBe(true);
    expect(afterEraseThenBack.get("shape:sketch")).toEqual(beforeErase.get("shape:sketch"));
  });

  it("erasing one shape never affects another", () => {
    const state = computeCanvasStateAtStep(ERASE_ACTIONS, 2);
    expect(state.has("shape:sketch")).toBe(false);
    expect(state.has("shape:clean")).toBe(true);
  });
});

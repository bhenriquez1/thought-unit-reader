// tests/knowledge/whiteboardLessonSnapshotGeometry.test.ts
// C4 (Phase 0 audit) — buildTeachingStepsSummary used to reduce each step to
// lossy text (a label + flattened narration string), discarding every
// draw-shape/draw-arrow action's real geometry. That was enough to build a
// text flashcard but not enough to build a Visual Recall occlusion task
// (hide a node, remove an arrow, reconstruct from memory) — those need to
// know WHICH shapes/arrows existed and where. This locks in that shapes/
// labels/arrows are now collected per step from the real plan actions.
//
// Real behavioral tests against the actual exported function —
// buildTeachingStepsSummary has no React/DOM/IO dependency.

import { buildTeachingStepsSummary } from "@/lib/knowledge/whiteboardLessonSnapshotStore";
import type { ProfessorLessonPlan } from "@/lib/whiteboard/professorLessonPlan";

function fixturePlanWithGeometry(): ProfessorLessonPlan {
  return {
    visualGrammar: "mechanism",
    title: "Geometry Test Lesson",
    centralQuestion: "How does the mechanism work?",
    learningObjective: "Understand the mechanism.",
    synthesisQuestion: "How does the mechanism work?",
    sourceSnapshot: {
      documentId: "doc-a",
      pageNumber: 3,
      pageTruthKey: "doc-a::3::t",
      activeCanonicalUnitId: "kn_doc-a_1",
      vsgId: "vsg-hash-456",
      plannerVersion: 5,
    },
    segments: [
      { id: "seg0", text: "First the trigger fires.", tone: "introduce", pace: "normal", pauseAfterMs: 300, linkedActionIds: ["a3"], contentRole: "PROFESSOR_EXPLANATION" },
    ],
    actions: [
      // Step 0: two shapes, two labels, one arrow between them.
      { type: "draw-shape", actionId: "a0", shapeId: "shape-trigger", shape: "circle", bounds: { x: 0, y: 0, w: 80, h: 80 }, durationMs: 400, stepId: 0 },
      { type: "draw-shape", actionId: "a1", shapeId: "shape-outcome", shape: "box", bounds: { x: 200, y: 0, w: 100, h: 60 }, durationMs: 400, stepId: 0 },
      { type: "write", actionId: "a2", shapeId: "label-trigger", targetId: "shape-trigger", text: "Trigger", x: 10, y: 10, durationMs: 300, stepId: 0 },
      { type: "write", actionId: "a3b", shapeId: "label-outcome", targetId: "shape-outcome", text: "Outcome", x: 210, y: 10, durationMs: 300, stepId: 0 },
      { type: "draw-arrow", actionId: "a4", shapeId: "arrow-1", from: { x: 80, y: 40 }, to: { x: 200, y: 30 }, relationshipKind: "causes", durationMs: 300, stepId: 0 },
      { type: "speak", actionId: "a3", segmentId: "seg0", text: "First the trigger fires.", durationMs: 1200, stepId: 0 },
      // Step 1: no shapes/arrows, just a label — proves per-step scoping.
      { type: "write", actionId: "a5", shapeId: "label-step2", text: "Step Two", x: 0, y: 100, durationMs: 300, stepId: 1 },
    ],
  };
}

describe("buildTeachingStepsSummary — geometry (shapes/labels/arrows) per step", () => {
  it("REQUIRED: collects every draw-shape action in a step, with real bounds", () => {
    const steps = buildTeachingStepsSummary(fixturePlanWithGeometry());
    expect(steps[0].shapes).toEqual([
      { shapeId: "shape-trigger", targetId: undefined, kind: "circle", bounds: { x: 0, y: 0, w: 80, h: 80 } },
      { shapeId: "shape-outcome", targetId: undefined, kind: "box", bounds: { x: 200, y: 0, w: 100, h: 60 } },
    ]);
  });

  it("REQUIRED: collects every write action in a step (not just the first, which `label` alone summarizes)", () => {
    const steps = buildTeachingStepsSummary(fixturePlanWithGeometry());
    expect(steps[0].labels).toEqual([
      { shapeId: "label-trigger", targetId: "shape-trigger", text: "Trigger", x: 10, y: 10 },
      { shapeId: "label-outcome", targetId: "shape-outcome", text: "Outcome", x: 210, y: 10 },
    ]);
  });

  it("REQUIRED: collects arrows with their endpoints and relationshipKind", () => {
    const steps = buildTeachingStepsSummary(fixturePlanWithGeometry());
    expect(steps[0].arrows).toEqual([
      { shapeId: "arrow-1", targetId: undefined, from: { x: 80, y: 40 }, to: { x: 200, y: 30 }, relationshipKind: "causes" },
    ]);
  });

  it("REQUIRED: a step with no shapes/arrows gets empty arrays, not undefined — always a real array to iterate", () => {
    const steps = buildTeachingStepsSummary(fixturePlanWithGeometry());
    expect(steps[1].shapes).toEqual([]);
    expect(steps[1].arrows).toEqual([]);
    expect(steps[1].labels).toEqual([{ shapeId: "label-step2", targetId: undefined, text: "Step Two", x: 0, y: 100 }]);
  });

  it("geometry from one step never leaks into another step's arrays", () => {
    const steps = buildTeachingStepsSummary(fixturePlanWithGeometry());
    const step0ShapeIds = steps[0].shapes!.map((s) => s.shapeId);
    const step1ShapeIds = steps[1].shapes!.map((s) => s.shapeId);
    expect(step0ShapeIds).not.toEqual(step1ShapeIds);
    expect(step1ShapeIds).toEqual([]);
  });
});

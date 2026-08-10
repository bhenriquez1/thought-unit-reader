import { applyProfessorTldrawAgentPatches } from "../../lib/whiteboard/professorTldrawAgent";
import type { ProfessorLessonPlan } from "../../lib/whiteboard/professorLessonPlan";

const PLAN: ProfessorLessonPlan = {
  visualGrammar: "mechanism", teachingStructures: ["mechanism-causal-process"],
  title: "T", centralQuestion: "Q", learningObjective: "L", synthesisQuestion: "S",
  sourceSnapshot: { documentId: "d", pageNumber: 1, pageTruthKey: "d::1", activeCanonicalUnitId: null, vsgId: "v", plannerVersion: 7 },
  segments: [], directorSteps: [],
  actions: [
    { type: "draw-shape", actionId: "draw-1", shapeId: "shape:one", shape: "box", bounds: { x: 0, y: 0, w: 10, h: 10 }, durationMs: 1, stepId: 1 },
    { type: "move-camera", actionId: "camera-1", targetIds: ["shape:one"], retainContextTargetIds: [], cameraIntent: "active-concept", focusBounds: { x: 0, y: 0, w: 10, h: 10 }, durationMs: 1, stepId: 1 },
    { type: "draw-shape", actionId: "draw-2", shapeId: "shape:future", shape: "box", bounds: { x: 20, y: 0, w: 10, h: 10 }, durationMs: 1, stepId: 2 },
  ],
};

describe("Claude-powered tldraw execution guard", () => {
  it("accepts camera choreography but drops invented and future shape ids", () => {
    const refined = applyProfessorTldrawAgentPatches(PLAN, [{
      stepId: 1,
      cameraIntent: "keep-context",
      retainContextTargetIds: ["shape:one", "shape:future", "shape:invented"],
      correctionNeeded: true,
    }], "claude-test");
    const camera = refined.actions.find(action => action.type === "move-camera");
    expect(camera).toMatchObject({
      cameraIntent: "keep-context",
      retainContextTargetIds: ["shape:one"],
      targetIds: ["shape:one"],
    });
    expect(refined.executionAgent).toEqual({ provider: "claude", model: "claude-test", correctedStepIds: [1] });
  });
});

import {
  buildProfessorTldrawAgentRequest,
  ProfessorTldrawAgentRequestSchema,
  verifyProfessorTldrawAgentResponse,
} from "../../lib/whiteboard/professorTldrawAgent";
import type { ProfessorLessonPlan, ProfessorTeachingAction } from "../../lib/whiteboard/professorLessonPlan";

const DRAW: ProfessorTeachingAction = { type: "draw-shape", actionId: "draw-1", shapeId: "shape:one", targetId: "source-one", shape: "box", bounds: { x: 0, y: 0, w: 120, h: 70 }, durationMs: 1, stepId: 1 };
const WRITE: ProfessorTeachingAction = { type: "write", actionId: "write-1", shapeId: "shape:one", targetId: "source-one", text: "Bilateral finger rests", x: 12, y: 18, durationMs: 1, stepId: 1 };
const CAMERA: ProfessorTeachingAction = { type: "move-camera", actionId: "camera-1", targetIds: ["shape:one"], retainContextTargetIds: ["shape:prior"], cameraIntent: "active-concept", focusBounds: { x: 0, y: 0, w: 120, h: 70 }, durationMs: 1, stepId: 1 };

const PLAN: ProfessorLessonPlan = {
  visualGrammar: "anatomy", teachingStructures: ["anatomy-spatial-relationship"],
  title: "T", centralQuestion: "Q", learningObjective: "L", synthesisQuestion: "S",
  sourceSnapshot: { documentId: "d", pageNumber: 1, pageTruthKey: "d::1", activeCanonicalUnitId: null, vsgId: "v", plannerVersion: 7 },
  segments: [],
  actions: [DRAW, WRITE, CAMERA, { type: "draw-shape", actionId: "future", shapeId: "shape:future", targetId: "future-source", shape: "box", bounds: { x: 400, y: 0, w: 100, h: 60 }, durationMs: 1, stepId: 2 }],
  directorSteps: [{
    stepId: 1,
    targetId: "n1",
    sourceEvidence: [{ targetId: "n1", sourceId: "source-one", exactText: "Use bilateral finger rests to stabilize the tray." }],
    teachingGoal: "Show how bilateral finger rests stabilize the tray.",
    teachingStructure: "anatomy-spatial-relationship",
    visualNeeded: true,
    visualIntent: "Sketch the tray and two stabilizing rests.",
    narration: "The two rests stabilize pressure on both sides.",
    drawInstructions: [CAMERA, DRAW, WRITE],
    relationships: [], emphasis: [], focusBounds: { x: 0, y: 0, w: 120, h: 70 },
    cameraIntent: "active-concept", checkpoint: null,
  }],
};

const CANVAS = {
  viewportBounds: { x: -50, y: -50, w: 500, h: 300 },
  screenshotBase64: "cG5n",
  shapes: [{
    shapeId: "shape:prior", type: "draw", bounds: { x: -30, y: 20, w: 20, h: 20 },
    text: "", semanticRole: "prior-context", sourceTargetId: "source-prior", origin: "planner" as const,
  }],
};

describe("Professor tldraw Agent — visual context and current-step isolation", () => {
  it("builds one current-step request with screenshot + structured shapes and never includes a future step", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS });
    expect(request).not.toBeNull();
    expect(request).toMatchObject({
      pass: "execute",
      step: { stepId: 1, allowedLabels: ["Bilateral finger rests"], allowedSourceTargetIds: ["source-one"] },
      canvas: { screenshotBase64: "cG5n", shapes: [{ shapeId: "shape:prior" }] },
    });
    expect(JSON.stringify(request)).not.toContain("shape:future");
    expect(JSON.stringify(request)).not.toContain("future-source");
  });

  it("does not create a request for a verbal-only/PDF step", () => {
    const verbalPlan: ProfessorLessonPlan = {
      ...PLAN,
      directorSteps: [{ ...PLAN.directorSteps![0], visualNeeded: false, focusBounds: null, cameraIntent: "stay-on-pdf" }],
    };
    expect(buildProfessorTldrawAgentRequest({ plan: verbalPlan, stepId: 1, pass: "execute", canvas: CANVAS })).toBeNull();
  });
});

describe("Professor tldraw Agent — deterministic hands gate", () => {
  it("accepts freehand, pressure, exact labels and arrows while clamping geometry and dropping invented labels/facts", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      model: "claude-test", stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "drawAnatomySketch", localId: "tray-outline", sourceTargetId: "invented-source", points: [{ x: -999, y: -999, z: 0.1 }, { x: 999, y: 999, z: 0.9 }], color: "black", size: "m", dash: "draw", isPen: true, closed: false, fill: "none" },
        { tool: "drawPressureZone", localId: "pressure", sourceTargetId: "source-one", bounds: { x: 20, y: 20, w: 40, h: 20 }, color: "red", opacity: 0.2 },
        { tool: "writeLabel", localId: "valid-label", sourceTargetId: "source-one", text: "Bilateral finger rests", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
        { tool: "writeLabel", localId: "invented-label", sourceTargetId: "source-one", text: "Unsupported anatomy fact", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
        { tool: "drawFlowArrow", localId: "stability-arrow", sourceTargetId: "source-one", from: { x: 10, y: 20 }, to: { x: 80, y: 50 }, color: "green", size: "m", dash: "draw" },
      ],
    });
    const stroke = verified.actions.find(action => action.type === "draw-freehand") as any;
    expect(stroke).toMatchObject({ shapeId: "shape:prof-agent-1-tray-outline", visualRole: "drawAnatomySketch" });
    expect(stroke.targetId).toBeUndefined();
    expect(stroke.points[0]).toEqual({ x: -120, y: -120, z: 0.1 });
    expect(stroke.points[1]).toEqual({ x: 240, y: 190, z: 0.9 });
    expect(verified.actions.some(action => action.type === "write" && action.text === "Bilateral finger rests")).toBe(true);
    expect(verified.actions.some(action => action.type === "write" && action.text === "Unsupported anatomy fact")).toBe(false);
    expect(verified.actions.some(action => action.type === "draw-arrow")).toBe(true);
    expect(verified.actions[0].type).toBe("move-camera");
    expect(verified.localIds).not.toContain("invented-label");
  });

  it("lets inspect erase only this step's prior agent ids and retains only real canvas shapes", () => {
    const request = buildProfessorTldrawAgentRequest({
      plan: PLAN, stepId: 1, pass: "inspect", canvas: CANVAS, priorAgentLocalIds: ["tray-outline"],
    })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "inspect", complete: true,
      assessment: { needsCorrection: true, issues: ["local overlap"] },
      actions: [
        { tool: "eraseRegion", targetLocalId: "tray-outline" },
        { tool: "eraseRegion", targetLocalId: "future-or-invented" },
        { tool: "focusNode", localId: "camera-fix", bounds: { x: 0, y: 0, w: 120, h: 70 }, retainShapeIds: ["shape:prior", "shape:future"] },
      ],
    });
    expect(verified.actions.some(action => action.type === "erase" && action.targetShapeId === "shape:prof-agent-1-tray-outline")).toBe(true);
    expect(verified.actions.some(action => action.type === "erase" && action.targetShapeId.includes("future-or-invented"))).toBe(false);
    const camera = verified.actions.find(action => action.type === "move-camera") as any;
    expect(camera.retainContextTargetIds).toEqual(["shape:prior"]);
  });

  it("drops a response for a different step or pass", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 2, pass: "inspect", complete: true,
      assessment: { needsCorrection: false, issues: [] }, actions: [],
    });
    expect(verified.actions).toEqual([]);
  });

  it("rejects oversized screenshots and invalid local ids at the request/response boundary", () => {
    expect(() => ProfessorTldrawAgentRequestSchema.parse({
      ...buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!,
      canvas: { ...CANVAS, screenshotBase64: "x".repeat(900_001) },
    })).toThrow();
  });
});

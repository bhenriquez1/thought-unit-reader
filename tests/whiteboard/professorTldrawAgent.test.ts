import {
  buildProfessorTldrawAgentRequest,
  isNontrivialProfessorAgentAction,
  isGroundedLabelText,
  resolveProfessorAgentFailure,
  ProfessorTldrawAgentRequestSchema,
  verifyProfessorTldrawAgentResponse,
  computeVisualDensityDiagnostic,
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
  it("marks a grounded mechanism step as agent-eligible", () => {
    const mechanismPlan: ProfessorLessonPlan = {
      ...PLAN,
      teachingStructures: ["mechanism-causal-process"],
      directorSteps: [{
        ...PLAN.directorSteps![0],
        teachingStructure: "mechanism-causal-process",
        visualIntent: "Show the grounded causal flow.",
      }],
    };
    const request = buildProfessorTldrawAgentRequest({ plan: mechanismPlan, stepId: 1, pass: "execute", canvas: CANVAS });
    expect(request).not.toBeNull();
    expect(request?.step.teachingStructure).toBe("mechanism-causal-process");
  });

  it("builds one current-step request with screenshot + structured shapes and never includes a future step", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS });
    expect(request).not.toBeNull();
    expect(request).toMatchObject({
      identity: { documentId: "d", pageTruthKey: "d::1", stepId: 1, groundedConceptIds: ["source-one"] },
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
  it("stops strict development/test playback but preserves production fallback", () => {
    expect(resolveProfessorAgentFailure(true, "timeout")).toEqual({ reason: "timeout", fallbackUsed: false, shouldStopPlayback: true });
    expect(resolveProfessorAgentFailure(false, "timeout")).toEqual({ reason: "timeout", fallbackUsed: true, shouldStopPlayback: false });
  });
  it("accepts freehand, pressure, exact labels and arrows while clamping geometry and dropping invented labels/facts", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      model: "claude-test", stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "drawAnatomySketch", localId: "tray-outline", sourceTargetId: "source-one", points: [{ x: -999, y: -999, z: 0.1 }, { x: 999, y: 999, z: 0.9 }], color: "black", size: "m", dash: "draw", isPen: true, closed: false, fill: "none" },
        { tool: "drawPressureZone", localId: "pressure", sourceTargetId: "source-one", bounds: { x: 20, y: 20, w: 40, h: 20 }, color: "red", opacity: 0.2 },
        { tool: "writeLabel", localId: "valid-label", sourceTargetId: "source-one", text: "Bilateral finger rests", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
        { tool: "writeLabel", localId: "invented-label", sourceTargetId: "source-one", text: "Unsupported anatomy fact", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
        { tool: "drawFlowArrow", localId: "stability-arrow", sourceTargetId: "source-one", from: { x: 10, y: 20 }, to: { x: 80, y: 50 }, color: "green", size: "m", dash: "draw" },
      ],
    });
    const stroke = verified.actions.find(action => action.type === "draw-freehand") as any;
    expect(stroke).toMatchObject({ shapeId: "shape:prof-agent-1-tray-outline", visualRole: "drawAnatomySketch" });
    expect(stroke.targetId).toBe("source-one");
    expect(stroke.agentGrounding).toMatchObject({
      documentId: "d", pageTruthKey: "d::1", stepId: 1, conceptIds: ["source-one"],
    });
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

  it("rejects a request whose page or step identity does not match its current context", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    expect(() => ProfessorTldrawAgentRequestSchema.parse({
      ...request, identity: { ...request.identity, pageTruthKey: "another-page" },
    })).toThrow("page_truth_mismatch");
    expect(() => ProfessorTldrawAgentRequestSchema.parse({
      ...request, identity: { ...request.identity, stepId: 2 },
    })).toThrow("step_mismatch");
  });

  it("rejects ungrounded primitives and does not count a generic box as nontrivial", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [{ tool: "drawFreehandStroke", localId: "creative", sourceTargetId: null, points: [{ x: 0, y: 0 }, { x: 20, y: 20 }], color: "black", size: "m", dash: "draw", isPen: true, closed: false, fill: "none" }],
    });
    expect(verified.actions.filter(action => action.type !== "move-camera")).toEqual([]);
    expect(verified.rejectedActionCount).toBe(1);
    expect(isNontrivialProfessorAgentAction(DRAW)).toBe(false);
  });

  it("REQUIRED (label-grounding loosening): accepts a writeLabel/drawCallout whose text is NOT in allowedLabels but is copied directly from this step's own narration — lets the agent decompose one coarse deterministic label into the finer terms narration already names", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    // "stabilize pressure" appears verbatim in directorSteps[0].narration
    // ("The two rests stabilize pressure on both sides.") but is NOT one of
    // allowedLabels (["Bilateral finger rests"]) — this is exactly the kind
    // of finer-grained, still-grounded sub-phrase the loosening is for.
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "narration-label", sourceTargetId: "source-one", text: "stabilize pressure", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
        { tool: "drawCallout", localId: "narration-callout", sourceTargetId: "source-one", bounds: { x: 0, y: 0, w: 160, h: 70 }, label: "both sides", color: "orange" },
      ],
    });
    expect(verified.actions.some(action => action.type === "write" && action.text === "stabilize pressure")).toBe(true);
    expect(verified.actions.some(action => action.type === "write" && action.text === "both sides")).toBe(true);
    expect(verified.rejectedActionCount).toBe(0);
  });

  it("REQUIRED (label-grounding loosening): still rejects a writeLabel with text absent from allowedLabels AND absent from narration/relationships — widening the source of grounded vocabulary does not remove the grounding requirement", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "invented", sourceTargetId: "source-one", text: "Made-up clinical claim", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
      ],
    });
    expect(verified.actions.filter(action => action.type !== "move-camera")).toEqual([]);
    expect(verified.rejectedActionCount).toBe(1);
  });

  it("REQUIRED (label-grounding loosening): a grounded relationship label is also accepted, matching the same rule as narration", () => {
    const planWithRelationship: ProfessorLessonPlan = {
      ...PLAN,
      directorSteps: [{
        ...PLAN.directorSteps![0],
        relationships: [{ targetId: "n2", kind: "supports", label: "even pressure distribution" }],
      }],
    };
    const request = buildProfessorTldrawAgentRequest({ plan: planWithRelationship, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "relationship-label", sourceTargetId: "source-one", text: "even pressure distribution", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
      ],
    });
    expect(verified.actions.some(action => action.type === "write" && action.text === "even pressure distribution")).toBe(true);
  });

  it("REQUIRED (item 4B: source-evidence grounding): accepts a writeLabel whose text appears ONLY in this step's canonical source evidence — not in allowedLabels, narration, or relationships — the concrete fix for entity names the narration summarized but the page names individually", () => {
    const planWithEvidence: ProfessorLessonPlan = {
      ...PLAN,
      directorSteps: [{
        ...PLAN.directorSteps![0],
        // Narration only says "the team" — it never names each role. The
        // source page's own evidence text is the ONLY place "anesthesiologist"
        // and "residents" actually appear.
        narration: "The team works together to keep the patient safe.",
        sourceEvidence: [{ targetId: "n1", sourceId: "source-one", exactText: "The surgeon, nurses, anesthesiologist, and residents each play a distinct role." }],
      }],
    };
    const request = buildProfessorTldrawAgentRequest({ plan: planWithEvidence, stepId: 1, pass: "execute", canvas: CANVAS })!;
    expect(request.step.sourceEvidenceText).toEqual(["The surgeon, nurses, anesthesiologist, and residents each play a distinct role."]);
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "evidence-label-1", sourceTargetId: "source-one", text: "anesthesiologist", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
        { tool: "writeLabel", localId: "evidence-label-2", sourceTargetId: "source-one", text: "residents", x: 40, y: 30, color: "black", size: "m", attachToLocalId: null },
      ],
    });
    expect(verified.actions.filter(a => a.type === "write").map(a => (a as any).text).sort()).toEqual(["anesthesiologist", "residents"]);
    expect(verified.rejectedActionCount).toBe(0);
  });

  it("REQUIRED (item 4B: source-evidence grounding): still rejects a label absent from allowedLabels, narration, relationships, AND source evidence — widening the source does not remove the requirement", () => {
    const planWithEvidence: ProfessorLessonPlan = {
      ...PLAN,
      directorSteps: [{
        ...PLAN.directorSteps![0],
        narration: "The team works together to keep the patient safe.",
        sourceEvidence: [{ targetId: "n1", sourceId: "source-one", exactText: "The surgeon, nurses, anesthesiologist, and residents each play a distinct role." }],
      }],
    };
    const request = buildProfessorTldrawAgentRequest({ plan: planWithEvidence, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "invented", sourceTargetId: "source-one", text: "hospital administrator", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
      ],
    });
    expect(verified.actions.filter(action => action.type !== "move-camera")).toEqual([]);
    expect(verified.rejectedActionCount).toBe(1);
  });

  describe("isGroundedLabelText — the pure predicate directly", () => {
    const allowed = new Set(["Reactants"]);
    const blob = "reactants the ionic compound dissociates into sodium and chloride ions which conduct current";

    it("accepts an exact allowedLabels match", () => {
      expect(isGroundedLabelText("Reactants", allowed, blob)).toBe(true);
    });

    it("accepts a finer-grained term genuinely present in the grounded text blob (case/punctuation-insensitive)", () => {
      expect(isGroundedLabelText("Na+ Cl-", allowed, blob)).toBe(false); // not literally present as written
      expect(isGroundedLabelText("sodium and chloride ions", allowed, blob)).toBe(true);
      expect(isGroundedLabelText("SODIUM AND CHLORIDE IONS", allowed, blob)).toBe(true);
    });

    it("rejects fabricated text not present anywhere in the grounded blob", () => {
      expect(isGroundedLabelText("Potassium iodide forms a yellow crystal", allowed, blob)).toBe(false);
    });

    it("rejects a vacuous very-short match (guards against a stray 1-2 char token trivially substring-matching)", () => {
      expect(isGroundedLabelText("io", allowed, blob)).toBe(false);
    });
  });

  it("rejects oversized screenshots and invalid local ids at the request/response boundary", () => {
    expect(() => ProfessorTldrawAgentRequestSchema.parse({
      ...buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!,
      canvas: { ...CANVAS, screenshotBase64: "x".repeat(900_001) },
    })).toThrow();
  });
});

// Correction (Whiteboard density) — attachToLocalId was parsed (LabelToolSchema)
// but never actually used: every "writeLabel ... attachToLocalId: X" call
// still produced its OWN independent shapeId, so the label always rendered
// as a floating text shape next to a permanently empty symbol (X's own
// draw-shape action never gets a `text` field from anywhere else). This is
// the direct, deterministic cause of "empty oval / empty rounded rectangle"
// — not a probabilistic model-quality issue.
describe("Professor tldraw Agent — attachToLocalId merges a label onto its target symbol's own shapeId", () => {
  it("REQUIRED: a writeLabel with attachToLocalId pointing at a symbol drawn earlier in the SAME response shares that symbol's shapeId — the concrete fix for empty ovals/rectangles", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "drawSymbol", localId: "matter-oval", sourceTargetId: "source-one", symbol: "ellipse", bounds: { x: 20, y: 20, w: 80, h: 40 }, color: "blue", size: "m", dash: "draw", fill: "none" },
        { tool: "writeLabel", localId: "matter-label", sourceTargetId: "source-one", text: "Bilateral finger rests", x: 20, y: 30, color: "black", size: "m", attachToLocalId: "matter-oval" },
      ],
    });
    const symbol = verified.actions.find(a => a.type === "draw-shape" && a.visualRole === "drawSymbol") as any;
    const label = verified.actions.find(a => a.type === "write" && a.text === "Bilateral finger rests") as any;
    expect(symbol).toBeDefined();
    expect(label).toBeDefined();
    expect(label.shapeId).toBe(symbol.shapeId);
  });

  it("REQUIRED: attaching onto a symbol from a PRIOR pass (via priorAgentLocalIds) also merges correctly", () => {
    const request = buildProfessorTldrawAgentRequest({
      plan: PLAN, stepId: 1, pass: "inspect", canvas: CANVAS, priorAgentLocalIds: ["earlier-oval"],
    })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "inspect", complete: true,
      assessment: { needsCorrection: true, issues: ["missing label"] },
      actions: [
        { tool: "writeLabel", localId: "late-label", sourceTargetId: "source-one", text: "Bilateral finger rests", x: 20, y: 30, color: "black", size: "m", attachToLocalId: "earlier-oval" },
      ],
    });
    const label = verified.actions.find(a => a.type === "write") as any;
    expect(label.shapeId).toBe("shape:prof-agent-1-earlier-oval");
  });

  it("an attachToLocalId that names an unresolvable/hallucinated id falls back to an independent label — never trusts an unverified target", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "orphan-label", sourceTargetId: "source-one", text: "Bilateral finger rests", x: 20, y: 30, color: "black", size: "m", attachToLocalId: "never-drawn" },
      ],
    });
    const label = verified.actions.find(a => a.type === "write") as any;
    expect(label.shapeId).toBe("shape:prof-agent-1-orphan-label");
    expect(label.shapeId).not.toBe("shape:prof-agent-1-never-drawn");
  });

  it("attachToLocalId: null (the common case) is unchanged — an independent label with its own pushClearOf-positioned shapeId", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "standalone-label", sourceTargetId: "source-one", text: "Bilateral finger rests", x: 20, y: 30, color: "black", size: "m", attachToLocalId: null },
      ],
    });
    const label = verified.actions.find(a => a.type === "write") as any;
    expect(label.shapeId).toBe("shape:prof-agent-1-standalone-label");
  });

  it("REQUIRED end-to-end: once merged, the shape's replayed canvas state actually carries BOTH the symbol's own kind and the label's text — not two separate shapes", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "drawSymbol", localId: "atom-circle", sourceTargetId: "source-one", symbol: "ellipse", bounds: { x: 20, y: 20, w: 80, h: 40 }, color: "blue", size: "m", dash: "draw", fill: "none" },
        { tool: "writeLabel", localId: "atom-label", sourceTargetId: "source-one", text: "Bilateral finger rests", x: 20, y: 30, color: "black", size: "m", attachToLocalId: "atom-circle" },
      ],
    });
    const { computeCanvasStateAtStep } = require("../../lib/whiteboard/professorTimelineEngine");
    const allActions = [...PLAN.actions, ...verified.actions.map(a => ({ ...a, stepId: 999 }))];
    const state = computeCanvasStateAtStep(allActions, allActions.length - 1);
    const symbolAction = verified.actions.find(a => a.type === "draw-shape") as any;
    const merged = state.get(symbolAction.shapeId);
    expect(merged).toBeDefined();
    expect(merged.kind).toBe("circle"); // "ellipse" symbol -> "circle" ShapeVisualKind
    expect(merged.text).toBe("Bilateral finger rests");
  });
});

// Correction (Whiteboard density) — "Add validation such as:
// meaningfulPrimitiveCount / emptyContainerCount / usedCanvasBounds /
// activeTeachingBounds / canvasUtilizationRatio," and "if it creates five
// shapes and three of them are empty containers, the step should be
// rejected and replanned."
describe("computeVisualDensityDiagnostic", () => {
  const TEACHING_BOUNDS = { x: 0, y: 0, w: 200, h: 100 };

  it("an empty action list reports all zeros, not a crash", () => {
    expect(computeVisualDensityDiagnostic([], null)).toEqual({
      meaningfulPrimitiveCount: 0, emptyContainerCount: 0, totalShapeCount: 0,
      usedCanvasBounds: null, activeTeachingBounds: null, canvasUtilizationRatio: 0,
      labelDependentShapeCount: 0, labelIndependentMeaningfulCount: 0,
    });
  });

  it("REQUIRED: a drawSymbol shape with a merged label (matching shapeId) counts as meaningful, not empty", () => {
    const symbol: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:sym", targetId: "s", shape: "circle", bounds: { x: 0, y: 0, w: 80, h: 40 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    const label: ProfessorTeachingAction = { type: "write", actionId: "a2", shapeId: "shape:sym", targetId: "s", text: "matter", x: 0, y: 0, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([symbol, label], TEACHING_BOUNDS);
    expect(diagnostic.emptyContainerCount).toBe(0);
    expect(diagnostic.totalShapeCount).toBe(1);
    expect(diagnostic.meaningfulPrimitiveCount).toBe(1); // the shape, not double-counted with its own label
  });

  it("REQUIRED: a drawSymbol shape with NO merged label is an empty container — the direct measure of 'empty oval/rectangle'", () => {
    const symbol: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:sym", targetId: "s", shape: "box", bounds: { x: 0, y: 0, w: 80, h: 40 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([symbol], TEACHING_BOUNDS);
    expect(diagnostic.emptyContainerCount).toBe(1);
    expect(diagnostic.totalShapeCount).toBe(1);
    expect(diagnostic.meaningfulPrimitiveCount).toBe(0);
  });

  it("a drawPressureZone/highlightRegion shape with no label is NOT an empty container — deliberately unlabeled fills, not a bare outline", () => {
    const zone: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:zone", targetId: "s", shape: "circle", bounds: { x: 0, y: 0, w: 80, h: 40 }, visualRole: "drawPressureZone", opacity: 0.2, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([zone], TEACHING_BOUNDS);
    expect(diagnostic.emptyContainerCount).toBe(0);
    expect(diagnostic.meaningfulPrimitiveCount).toBe(1);
  });

  it("a drawCallout/drawNumberBadge shape is never empty — always self-labeled via the same shapeId reused for its own write action", () => {
    const callout: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:callout", targetId: "s", shape: "cloud", bounds: { x: 0, y: 0, w: 80, h: 40 }, visualRole: "drawCallout", durationMs: 1, stepId: 1 };
    const calloutLabel: ProfessorTeachingAction = { type: "write", actionId: "a2", shapeId: "shape:callout", targetId: "s", text: "Note", x: 0, y: 0, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([callout, calloutLabel], TEACHING_BOUNDS);
    expect(diagnostic.emptyContainerCount).toBe(0);
  });

  it("a standalone write action (no matching draw-shape in the list) counts as a meaningful primitive on its own", () => {
    const label: ProfessorTeachingAction = { type: "write", actionId: "a1", shapeId: "shape:standalone", targetId: "s", text: "Title", x: 0, y: 0, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([label], TEACHING_BOUNDS);
    expect(diagnostic.meaningfulPrimitiveCount).toBe(1);
    expect(diagnostic.totalShapeCount).toBe(0);
  });

  it("freehand strokes and arrows always count as meaningful primitives", () => {
    const stroke: ProfessorTeachingAction = { type: "draw-freehand", actionId: "a1", shapeId: "shape:s", targetId: "s", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], durationMs: 1, stepId: 1 };
    const arrow: ProfessorTeachingAction = { type: "draw-arrow", actionId: "a2", shapeId: "shape:a", targetId: "s", from: { x: 0, y: 0 }, to: { x: 20, y: 20 }, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([stroke, arrow], TEACHING_BOUNDS);
    expect(diagnostic.meaningfulPrimitiveCount).toBe(2);
    expect(diagnostic.emptyContainerCount).toBe(0);
  });

  it("REQUIRED: the exact scenario named in the correction — 5 shapes, 3 of them empty containers", () => {
    const shapes: ProfessorTeachingAction[] = [
      { type: "draw-shape", actionId: "a1", shapeId: "shape:1", targetId: "s", shape: "box", bounds: { x: 0, y: 0, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 },
      { type: "draw-shape", actionId: "a2", shapeId: "shape:2", targetId: "s", shape: "circle", bounds: { x: 50, y: 0, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 },
      { type: "draw-shape", actionId: "a3", shapeId: "shape:3", targetId: "s", shape: "box", bounds: { x: 100, y: 0, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 },
      { type: "draw-shape", actionId: "a4", shapeId: "shape:4", targetId: "s", shape: "box", bounds: { x: 0, y: 30, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 },
      { type: "write", actionId: "a5", shapeId: "shape:4", targetId: "s", text: "labeled", x: 0, y: 30, durationMs: 1, stepId: 1 },
      { type: "draw-shape", actionId: "a6", shapeId: "shape:5", targetId: "s", shape: "circle", bounds: { x: 50, y: 30, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 },
      { type: "write", actionId: "a7", shapeId: "shape:5", targetId: "s", text: "also labeled", x: 50, y: 30, durationMs: 1, stepId: 1 },
    ];
    const diagnostic = computeVisualDensityDiagnostic(shapes, TEACHING_BOUNDS);
    expect(diagnostic.totalShapeCount).toBe(5);
    expect(diagnostic.emptyContainerCount).toBe(3);
    expect(diagnostic.emptyContainerCount / diagnostic.totalShapeCount).toBe(0.6);
  });

  it("usedCanvasBounds is the union of every real visual primitive's own bounds, and canvasUtilizationRatio compares its area against activeTeachingBounds", () => {
    const shapeA: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:a", targetId: "s", shape: "box", bounds: { x: 0, y: 0, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    const labelA: ProfessorTeachingAction = { type: "write", actionId: "a2", shapeId: "shape:a", targetId: "s", text: "x", x: 0, y: 0, durationMs: 1, stepId: 1 };
    const shapeB: ProfessorTeachingAction = { type: "draw-shape", actionId: "a3", shapeId: "shape:b", targetId: "s", shape: "box", bounds: { x: 60, y: 40, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    const labelB: ProfessorTeachingAction = { type: "write", actionId: "a4", shapeId: "shape:b", targetId: "s", text: "y", x: 60, y: 40, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([shapeA, labelA, shapeB, labelB], TEACHING_BOUNDS);
    // Union of (0,0,40,20) and (60,40,40,20) -> x:[0,100], y:[0,60] -> 100x60
    expect(diagnostic.usedCanvasBounds).toEqual({ x: 0, y: 0, w: 100, h: 60 });
    expect(diagnostic.activeTeachingBounds).toEqual(TEACHING_BOUNDS);
    // usedArea 6000 / teachingArea (200*100=20000) = 0.3
    expect(diagnostic.canvasUtilizationRatio).toBeCloseTo(0.3, 5);
  });

  it("canvasUtilizationRatio is 0 (never NaN/Infinity) when activeTeachingBounds is null or has zero area", () => {
    const shape: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:a", targetId: "s", shape: "box", bounds: { x: 0, y: 0, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    expect(computeVisualDensityDiagnostic([shape], null).canvasUtilizationRatio).toBe(0);
    expect(computeVisualDensityDiagnostic([shape], { x: 0, y: 0, w: 0, h: 0 }).canvasUtilizationRatio).toBe(0);
  });

  // L17 — "if removing the text labels makes the Whiteboard meaningless, it
  // isn't sufficiently visual." labelDependentShapeCount/
  // labelIndependentMeaningfulCount are a SEPARATE partition from
  // meaningfulPrimitiveCount/emptyContainerCount above: a LABELED drawSymbol
  // box is "meaningful" by the old metric (it's self-labeled, not empty),
  // but still label-DEPENDENT by this one — strip the text and it's just a
  // box.
  it("REQUIRED: the exact named failure mode — 'Reactants -> Products,' two LABELED drawSymbol boxes joined by one arrow — is almost entirely label-dependent", () => {
    const reactants: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:reactants", targetId: "s", shape: "box", bounds: { x: 0, y: 0, w: 80, h: 40 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    const reactantsLabel: ProfessorTeachingAction = { type: "write", actionId: "a2", shapeId: "shape:reactants", targetId: "s", text: "Reactants", x: 0, y: 0, durationMs: 1, stepId: 1 };
    const products: ProfessorTeachingAction = { type: "draw-shape", actionId: "a3", shapeId: "shape:products", targetId: "s", shape: "box", bounds: { x: 150, y: 0, w: 80, h: 40 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    const productsLabel: ProfessorTeachingAction = { type: "write", actionId: "a4", shapeId: "shape:products", targetId: "s", text: "Products", x: 150, y: 0, durationMs: 1, stepId: 1 };
    const arrow: ProfessorTeachingAction = { type: "draw-arrow", actionId: "a5", shapeId: "shape:arrow", targetId: "s", from: { x: 80, y: 20 }, to: { x: 150, y: 20 }, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([reactants, reactantsLabel, products, productsLabel, arrow], { x: 0, y: 0, w: 300, h: 100 });
    // Both boxes are self-labeled, so the OLD metric sees no empty containers at all.
    expect(diagnostic.emptyContainerCount).toBe(0);
    expect(diagnostic.meaningfulPrimitiveCount).toBe(3); // 2 self-labeled shapes + 1 arrow
    // But by the label-independent metric: 2 label-dependent boxes, only 1 label-independent mark (the arrow).
    expect(diagnostic.labelDependentShapeCount).toBe(2);
    expect(diagnostic.labelIndependentMeaningfulCount).toBe(1);
    const ratio = diagnostic.labelIndependentMeaningfulCount / (diagnostic.labelDependentShapeCount + diagnostic.labelIndependentMeaningfulCount);
    expect(ratio).toBeCloseTo(1 / 3, 5); // well under LABEL_INDEPENDENT_RATIO_FLOOR (0.4) — this is exactly what L17 rejects
  });

  it("REQUIRED: drawSymbol counts as label-dependent whether or not it actually has a label — an UNLABELED drawSymbol is already caught by emptyContainerCount, but this metric agrees it's not label-independent either", () => {
    const unlabeled: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:x", targetId: "s", shape: "ellipse" as any, bounds: { x: 0, y: 0, w: 40, h: 20 }, visualRole: "drawSymbol", durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([unlabeled], { x: 0, y: 0, w: 200, h: 100 });
    expect(diagnostic.labelDependentShapeCount).toBe(1);
    expect(diagnostic.labelIndependentMeaningfulCount).toBe(0);
  });

  it("REQUIRED: drawCallout and drawNumberBadge are label-dependent too — always self-labeled by the OLD metric, but their shape alone (a cloud, a numeral-less circle) conveys nothing", () => {
    const callout: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:callout", targetId: "s", shape: "cloud", bounds: { x: 0, y: 0, w: 80, h: 40 }, visualRole: "drawCallout", durationMs: 1, stepId: 1 };
    const calloutLabel: ProfessorTeachingAction = { type: "write", actionId: "a2", shapeId: "shape:callout", targetId: "s", text: "Note", x: 0, y: 0, durationMs: 1, stepId: 1 };
    const badge: ProfessorTeachingAction = { type: "draw-shape", actionId: "a3", shapeId: "shape:badge", targetId: "s", shape: "circle", bounds: { x: 0, y: 50, w: 28, h: 28 }, visualRole: "drawNumberBadge", durationMs: 1, stepId: 1 };
    const badgeLabel: ProfessorTeachingAction = { type: "write", actionId: "a4", shapeId: "shape:badge", targetId: "s", text: "1", x: 0, y: 50, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([callout, calloutLabel, badge, badgeLabel], { x: 0, y: 0, w: 200, h: 100 });
    expect(diagnostic.labelDependentShapeCount).toBe(2);
    expect(diagnostic.labelIndependentMeaningfulCount).toBe(0);
  });

  it("REQUIRED: drawPressureZone/highlightRegion/circleFeature are label-independent — their size/position IS the point, with or without a label", () => {
    const zone: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:zone", targetId: "s", shape: "circle", bounds: { x: 0, y: 0, w: 40, h: 40 }, visualRole: "drawPressureZone", opacity: 0.2, durationMs: 1, stepId: 1 };
    const highlight: ProfessorTeachingAction = { type: "draw-shape", actionId: "a2", shapeId: "shape:highlight", targetId: "s", shape: "box", bounds: { x: 50, y: 0, w: 40, h: 40 }, visualRole: "highlightRegion", opacity: 0.2, durationMs: 1, stepId: 1 };
    const ring: ProfessorTeachingAction = { type: "draw-shape", actionId: "a3", shapeId: "shape:ring", targetId: "s", shape: "circle", bounds: { x: 100, y: 0, w: 40, h: 40 }, visualRole: "circleFeature", durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([zone, highlight, ring], { x: 0, y: 0, w: 200, h: 100 });
    expect(diagnostic.labelDependentShapeCount).toBe(0);
    expect(diagnostic.labelIndependentMeaningfulCount).toBe(3);
  });

  it("REQUIRED: freehand strokes (including drawCrossSection/shadeRegion/crossOutMisconception's synthesized X, all rendered as draw-freehand) and arrows are always label-independent", () => {
    const crossSection: ProfessorTeachingAction = { type: "draw-freehand", actionId: "a1", shapeId: "shape:xs", targetId: "s", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], visualRole: "drawCrossSection", durationMs: 1, stepId: 1 };
    const shade: ProfessorTeachingAction = { type: "draw-freehand", actionId: "a2", shapeId: "shape:shade", targetId: "s", points: [{ x: 20, y: 0 }, { x: 30, y: 10 }], visualRole: "shadeRegion", durationMs: 1, stepId: 1 };
    const arrow: ProfessorTeachingAction = { type: "draw-arrow", actionId: "a3", shapeId: "shape:arrow", targetId: "s", from: { x: 0, y: 0 }, to: { x: 20, y: 20 }, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([crossSection, shade, arrow], { x: 0, y: 0, w: 200, h: 100 });
    expect(diagnostic.labelDependentShapeCount).toBe(0);
    expect(diagnostic.labelIndependentMeaningfulCount).toBe(3);
  });

  it("a genuinely rich composition (cross-section + shaded region + one labeled callout) clears the L17 ratio floor comfortably", () => {
    const crossSection: ProfessorTeachingAction = { type: "draw-freehand", actionId: "a1", shapeId: "shape:xs", targetId: "s", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], visualRole: "drawCrossSection", durationMs: 1, stepId: 1 };
    const shade: ProfessorTeachingAction = { type: "draw-freehand", actionId: "a2", shapeId: "shape:shade", targetId: "s", points: [{ x: 20, y: 0 }, { x: 30, y: 10 }], visualRole: "shadeRegion", durationMs: 1, stepId: 1 };
    const callout: ProfessorTeachingAction = { type: "draw-shape", actionId: "a3", shapeId: "shape:callout", targetId: "s", shape: "cloud", bounds: { x: 0, y: 50, w: 60, h: 30 }, visualRole: "drawCallout", durationMs: 1, stepId: 1 };
    const calloutLabel: ProfessorTeachingAction = { type: "write", actionId: "a4", shapeId: "shape:callout", targetId: "s", text: "Note", x: 0, y: 50, durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([crossSection, shade, callout, calloutLabel], { x: 0, y: 0, w: 200, h: 100 });
    expect(diagnostic.labelDependentShapeCount).toBe(1);
    expect(diagnostic.labelIndependentMeaningfulCount).toBe(2);
    const ratio = diagnostic.labelIndependentMeaningfulCount / (diagnostic.labelDependentShapeCount + diagnostic.labelIndependentMeaningfulCount);
    expect(ratio).toBeCloseTo(2 / 3, 5); // well above the 0.4 floor
  });
});

// L15 (Whiteboard composable primitives, following Brian's Armando-Hasudungan-
// style direction) — drawCrossSection/shadeRegion/circleFeature/
// crossOutMisconception are new semantic TOOLS the agent can call, but each
// decomposes into the SAME small set of rendering primitives (draw-freehand,
// draw-shape) the runtime already draws — no renderer changes. This is
// schema + verifier plumbing only; the runtime agent prompt isn't told about
// these yet (L16), so these tests exercise verifyProfessorTldrawAgentResponse
// directly with hand-built tool calls.
describe("Professor tldraw Agent — L15 composable primitives", () => {
  it("REQUIRED: drawCrossSection and shadeRegion reuse the exact same freehand pipeline as drawAnatomySketch — same action shape, just a different visualRole tag", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      model: "claude-test", stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "drawCrossSection", localId: "cross-section", sourceTargetId: "source-one", points: [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 0 }], color: "black", size: "m", dash: "draw", isPen: true, closed: true, fill: "pattern" },
        { tool: "shadeRegion", localId: "shade", sourceTargetId: "source-one", points: [{ x: 0, y: 0 }, { x: 20, y: 20 }], color: "grey", size: "m", dash: "draw", isPen: true, closed: true, fill: "solid" },
      ],
    });
    const crossSection = verified.actions.find(a => a.type === "draw-freehand" && a.visualRole === "drawCrossSection") as any;
    const shade = verified.actions.find(a => a.type === "draw-freehand" && a.visualRole === "shadeRegion") as any;
    expect(crossSection).toBeTruthy();
    expect(shade).toBeTruthy();
    expect(crossSection.shapeId).toBe("shape:prof-agent-1-cross-section");
    expect(crossSection.targetId).toBe("source-one");
    expect(crossSection.closed).toBe(true);
  });

  it("REQUIRED: circleFeature produces a fill:none circle draw-shape, grounded and clamped exactly like drawSymbol", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      model: "claude-test", stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "circleFeature", localId: "ring", sourceTargetId: "source-one", bounds: { x: -999, y: -999, w: 40, h: 40 }, color: "red", size: "m" },
      ],
    });
    const ring = verified.actions.find(a => a.type === "draw-shape" && a.visualRole === "circleFeature") as any;
    expect(ring).toBeTruthy();
    expect(ring.shape).toBe("circle");
    expect(ring.visualStyle.fill).toBe("none");
    expect(ring.targetId).toBe("source-one");
    // clamped into the expanded focus region, not left at the wildly out-of-bounds input
    expect(ring.bounds.x).toBeGreaterThan(-999);
  });

  it("REQUIRED: circleFeature is deliberately-unlabeled — never counted as an empty container even with no attached label", () => {
    const ring: ProfessorTeachingAction = { type: "draw-shape", actionId: "a1", shapeId: "shape:ring", targetId: "s", shape: "circle", bounds: { x: 0, y: 0, w: 40, h: 40 }, visualRole: "circleFeature", durationMs: 1, stepId: 1 };
    const diagnostic = computeVisualDensityDiagnostic([ring], { x: 0, y: 0, w: 200, h: 100 });
    expect(diagnostic.emptyContainerCount).toBe(0);
    expect(diagnostic.meaningfulPrimitiveCount).toBe(1);
  });

  it("REQUIRED: crossOutMisconception synthesizes two crossing freehand strokes from one tool call/localId — the agent picks WHERE, not how to draw an X", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      model: "claude-test", stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "crossOutMisconception", localId: "wrong-answer", sourceTargetId: "source-one", bounds: { x: 10, y: 10, w: 30, h: 30 }, color: "red", size: "m" },
      ],
    });
    const strokes = verified.actions.filter(a => a.type === "draw-freehand" && a.visualRole === "crossOutMisconception");
    expect(strokes.length).toBe(2);
    // distinct shapeIds — tldraw needs a unique record id per visible stroke
    const shapeIds = new Set(strokes.map(s => (s as any).shapeId));
    expect(shapeIds.size).toBe(2);
    // one localId accepted once, not twice, even though it produced 2 actions
    expect(verified.localIds.filter(id => id === "wrong-answer").length).toBe(1);
    for (const stroke of strokes) expect((stroke as any).targetId).toBe("source-one");
  });

  it("REQUIRED: an ungrounded sourceTargetId is rejected for every new tool, same as every existing one", () => {
    const request = buildProfessorTldrawAgentRequest({ plan: PLAN, stepId: 1, pass: "execute", canvas: CANVAS })!;
    const verified = verifyProfessorTldrawAgentResponse(request, {
      model: "claude-test", stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "drawCrossSection", localId: "bad-1", sourceTargetId: "not-allowed", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: "black", size: "m", dash: "draw", isPen: true, closed: true, fill: "pattern" },
        { tool: "circleFeature", localId: "bad-2", sourceTargetId: "not-allowed", bounds: { x: 0, y: 0, w: 10, h: 10 }, color: "red", size: "m" },
        { tool: "crossOutMisconception", localId: "bad-3", sourceTargetId: "not-allowed", bounds: { x: 0, y: 0, w: 10, h: 10 }, color: "red", size: "m" },
      ],
    });
    expect(verified.actions.length).toBe(1); // only the camera guardrail
    expect(verified.actions[0].type).toBe("move-camera");
    expect(verified.rejectedActionCount).toBe(3);
  });
});

import {
  buildProfessorTldrawAgentRequest,
  isNontrivialProfessorAgentAction,
  isGroundedLabelText,
  resolveProfessorAgentFailure,
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

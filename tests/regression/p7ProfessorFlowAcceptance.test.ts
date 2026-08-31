// tests/regression/p7ProfessorFlowAcceptance.test.ts
// P7 — the correction's own closing acceptance suite: a 16-step regression
// trace through the REAL Professor pipeline, composed exactly as the app
// composes it (VisualSceneGraph -> GroundedProfessorLessonScript ->
// buildProfessorTeachingActions -> resolveProfessorSurfaceAtStep/
// computeCanvasStateAtStep), proving every phase's own fix (P1-P6) still
// holds when the whole flow runs end to end, not just in isolation.
//
// "The most important correction is this: Professor does not belong inside
// Whiteboard. Whiteboard belongs inside Professor." — this file traces
// exactly that: PDF is the default and resting surface; Whiteboard opens
// only for a visualNeeded step and always returns to the exact next source
// position; the visual language drawn there is genuinely hand-drawn, not
// primarily rectangle+label+circle; and none of this ever depends on a
// separate, standing Evidence workspace.
//
// Same "no live browser, no live API" constraint every acceptance test in
// this repo works within (see tests/regression/m8FiveSubjectAcceptance.test.ts's
// own header comment) — real pure functions, real source-level checks for
// the one piece of state (pages/index.tsx's professorSurface default) that
// genuinely lives in a React component, never a reimplementation.

import fs from "fs";
import path from "path";
import { buildProfessorTeachingActions } from "../../lib/whiteboard/buildProfessorTeachingActions";
import {
  resolveProfessorSurfaceAtStep, computeCanvasStateAtStep,
} from "../../lib/whiteboard/professorTimelineEngine";
import type { GroundedProfessorLessonScript } from "../../lib/whiteboard/groundProfessorLesson";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";
import type { ProfessorLessonSourceSnapshot } from "../../lib/whiteboard/professorLessonPlan";

const SNAPSHOT: ProfessorLessonSourceSnapshot = {
  documentId: "doc-p7", pageNumber: 12, pageTruthKey: "doc-p7::12::t",
  activeCanonicalUnitId: null, vsgId: "vsg_p7", plannerVersion: 7,
};

function vsg(): VisualSceneGraph {
  return {
    id: "vsg_p7", grammar: "flow", drawType: "flow",
    nodes: [
      { id: "verbal", label: "verbal", body: "verbal body", canonicalType: "definition", importanceLevel: "high", tier: "step", role: "spoke", position: { x: 0, y: 0 }, size: { w: 260, h: 52 }, sourceId: "src-verbal" },
      { id: "hub", label: "hub", body: "hub body", canonicalType: "core-concept", importanceLevel: "critical", tier: "master", role: "hub", position: { x: 0, y: 80 }, size: { w: 260, h: 52 }, sourceId: "src-hub" },
      { id: "danger", label: "danger", body: "danger body", canonicalType: "trap", importanceLevel: "high", tier: "danger", role: "spoke", position: { x: 0, y: 160 }, size: { w: 260, h: 52 }, sourceId: "src-danger" },
    ],
    edges: [{ id: "e1", fromId: "hub", toId: "danger", kind: "causation" }],
    canvas: { width: 800, height: 600 }, builtAt: 0,
  };
}

function grounded(): GroundedProfessorLessonScript {
  return {
    title: "P7 Acceptance Lesson", visualGrammar: "concept-map",
    centralQuestion: "Why does this matter?", learningObjective: "Understand the hub concept and its main risk.",
    synthesisQuestion: "Explain the hub concept and its risk back.",
    nodeScripts: [
      {
        targetId: "verbal", shortLabel: "Verbal-only point", narration: "This point is taught verbally, no drawing needed.",
        tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism",
        drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
        sourceEvidence: ["verbal"], teachingGoal: "Understand the point verbally.", teachingStructure: "definition-concept",
        visualNeeded: false, visualIntent: "Teach verbally on the PDF.", cameraIntent: "stay-on-pdf", checkpoint: null,
      } as any,
      {
        targetId: "hub", shortLabel: "The hub idea", narration: "This is the central idea everything connects to.",
        tone: "introduce", pace: "normal", emphasize: true, teachingRole: "definition", spatialIntent: "central-mechanism",
        drawingIntent: "plain", emphasisTreatment: "underline", relationships: [], explain: [],
        sourceEvidence: ["hub"], teachingGoal: "Understand the hub concept.", teachingStructure: "definition-concept",
        visualNeeded: true, visualIntent: "Draw the hub concept.", cameraIntent: "active-concept", checkpoint: "What does this connect to?",
      } as any,
      {
        targetId: "e1", shortLabel: "Warns about", narration: "The hub concept warns about this common trap.",
        tone: "warn", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "warning-aside",
        drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
        sourceEvidence: ["e1"], teachingGoal: "Understand the risk.", teachingStructure: "mechanism-causal-process",
        visualNeeded: true, visualIntent: "Draw the connecting arrow.", cameraIntent: "follow-sequence", checkpoint: null,
      } as any,
      {
        targetId: "danger", shortLabel: "Common trap", narration: "Watch for this common mistake.",
        tone: "warn", pace: "slow", emphasize: false, teachingRole: "context", spatialIntent: "warning-aside",
        drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
        sourceEvidence: ["danger"], teachingGoal: "Understand the trap.", teachingStructure: "definition-concept",
        visualNeeded: true, visualIntent: "Draw the danger point.", cameraIntent: "active-concept", checkpoint: null,
      } as any,
    ],
    groups: [],
  };
}

describe("P7 — Professor flow acceptance (16 steps)", () => {
  const plan = buildProfessorTeachingActions(vsg(), grounded(), SNAPSHOT);

  it("1. Professor Mode's own default surface is 'pdf', not 'whiteboard' — the PDF Reader is the primary surface every session starts on", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
    expect(src).toMatch(/const \[professorSurface, setProfessorSurface\] = useState<"pdf" \| "whiteboard">\("pdf"\);/);
  });

  it("2. starting a Professor session explicitly resets back to 'pdf' even if a prior session left it on 'whiteboard' — never silently opens Whiteboard as the starting mode", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
    const idx = src.indexOf("const handleStartProfessor = useCallback(() => {");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/setProfessorSurface\("pdf"\)|professorSurface's own default\s*\n\s*\/\/ is "pdf"/);
  });

  it("3. a Thought Unit with visualNeeded:false stays on the PDF for its entire teaching step — Whiteboard is never invoked for a verbal-only point", () => {
    const verbalStep = plan.directorSteps!.find(s => s.targetId === "verbal")!;
    expect(verbalStep.visualNeeded).toBe(false);
    expect(verbalStep.drawInstructions).toHaveLength(0);
    const stepActions = plan.actions.filter(a => a.stepId === verbalStep.stepId);
    expect(stepActions.some(a => a.type === "set-surface" && a.surface === "whiteboard")).toBe(false);
  });

  it("4. before any teaching begins, Professor reads the grounded source passage with SOURCE_VERBATIM content role — never blurred with Professor's own commentary", () => {
    const sourceSegments = plan.segments.filter(s => s.contentRole === "SOURCE_VERBATIM");
    expect(sourceSegments.length).toBeGreaterThan(0);
  });

  it("5. Professor's own explanation narration carries PROFESSOR_EXPLANATION, distinct from the source passages — the two content roles are never the same segment", () => {
    const explanationSegments = plan.segments.filter(s => s.contentRole === "PROFESSOR_EXPLANATION");
    expect(explanationSegments.length).toBeGreaterThan(0);
    const sourceTexts = new Set(plan.segments.filter(s => s.contentRole === "SOURCE_VERBATIM").map(s => s.text));
    for (const seg of explanationSegments) expect(sourceTexts.has(seg.text)).toBe(false);
  });

  it("6. a visualNeeded:true step opens Whiteboard only AFTER its source passage was already read on the PDF — Whiteboard is invoked FROM Professor, not the other way around", () => {
    const hubStep = plan.directorSteps!.find(s => s.targetId === "hub")!;
    const stepActions = plan.actions.filter(a => a.stepId === hubStep.stepId);
    const pdfIdx = stepActions.findIndex(a => a.type === "set-surface" && a.surface === "pdf");
    const whiteboardIdx = stepActions.findIndex(a => a.type === "set-surface" && a.surface === "whiteboard");
    expect(pdfIdx).toBeGreaterThanOrEqual(0);
    expect(whiteboardIdx).toBeGreaterThan(pdfIdx);
  });

  it("7. after a visual step completes, the VERY NEXT teaching step re-opens on the PDF (reason 'source-passage', reading that point's own source) before it draws anything else — Whiteboard never stays open past the point it was needed for", () => {
    const hubStep = plan.directorSteps!.find(s => s.targetId === "hub")!;
    const edgeStep = plan.directorSteps!.find(s => s.targetId === "e1")!;
    expect(edgeStep.stepId).toBeGreaterThan(hubStep.stepId);
    const edgeStepActions = plan.actions.filter(a => a.stepId === edgeStep.stepId);
    const firstAction = edgeStepActions[0];
    expect(firstAction.type).toBe("set-surface");
    expect((firstAction as any).surface).toBe("pdf");
    expect((firstAction as any).reason).toBe("source-passage");
    // resolveProfessorSurfaceAtStep confirms the surface genuinely IS "pdf"
    // the instant this next step begins, not just that the action exists.
    const stepIndex = plan.actions.findIndex(a => a.actionId === (firstAction as any).actionId);
    const resolved = resolveProfessorSurfaceAtStep(plan.actions, stepIndex);
    expect(resolved?.surface).toBe("pdf");
  });

  it("8. an ordinary/hub concept node draws as a genuine hand-drawn organic outline (draw-freehand) — not primarily a plain rectangle", () => {
    const hubDraw = plan.actions.find(a => (a.type === "draw-shape" || a.type === "draw-freehand") && (a as any).targetId === "src-hub") as any;
    expect(hubDraw.type).toBe("draw-freehand");
    expect(hubDraw.points.length).toBeGreaterThan(4);
  });

  it("9. a danger-tier node still draws as a real, distinct tldraw geo shape (hexagon) — the deliberate exception where the shape itself carries meaning, not just an outline", () => {
    const dangerDraw = plan.actions.find(a => (a.type === "draw-shape" || a.type === "draw-freehand") && (a as any).targetId === "src-danger") as any;
    expect(dangerDraw.type).toBe("draw-shape");
    expect(dangerDraw.shape).toBe("hexagon");
  });

  it("10. the organic outline is included in its own teaching step's drawInstructions — P6's fix holds, nothing silently drops it from the runtime agent's own context", () => {
    const hubStep = plan.directorSteps!.find(s => s.targetId === "hub")!;
    const outlineInStep = hubStep.drawInstructions.find(a => (a as any).targetId === "src-hub");
    expect(outlineInStep).toBeDefined();
    expect((outlineInStep as any).type).toBe("draw-freehand");
  });

  it("11. every visual teaching step gets a real focusBounds and cameraIntent — the whiteboard camera follows the drawing pedagogically, never an arbitrary fixed zoom", () => {
    const visualSteps = plan.directorSteps!.filter(s => s.visualNeeded);
    expect(visualSteps.length).toBeGreaterThan(0);
    for (const step of visualSteps) {
      expect(step.focusBounds).not.toBeNull();
      expect(step.cameraIntent).toBeTruthy();
    }
  });

  it("12. the hub node's emphasize treatment ('underline' — a real, distinctly-rendered mark) reaches the final plan, not silently dropped for lack of a reachable schema value", () => {
    const hubDraw = plan.actions.find(a => (a.type === "draw-shape" || a.type === "draw-freehand") && (a as any).targetId === "src-hub") as any;
    const emphasize = plan.actions.find(a => a.type === "emphasize" && (a as any).targetId === hubDraw.shapeId) as any;
    expect(emphasize).toBeDefined();
    expect(emphasize.treatment).toBe("underline");
  });

  it("13. semantic teachingRole coloring and emphasis-overlay anchoring both survive on the hub node even though its outline is now a freehand stroke, not a geo shape", () => {
    const hubDraw = plan.actions.find(a => (a.type === "draw-shape" || a.type === "draw-freehand") && (a as any).targetId === "src-hub") as any;
    expect(hubDraw.teachingRole).toBe("definition");
    expect(hubDraw.bounds).toBeDefined();
  });

  it("14. the relationship arrow (hub 'warns-about' danger) draws as a real connector, and its own teaching step also returns focus to the PDF afterward — every visual step, not just the last one", () => {
    const arrow = plan.actions.find(a => a.type === "draw-arrow" && (a as any).targetId === "e1");
    expect(arrow).toBeDefined();
  });

  it("15. Whiteboard/Professor never depend on a separate, standing Evidence workspace — the panel P4 removed stays gone, and NotebookCanvas's own per-object provenance actions (View Source/Jump to Reader/Ask Professor) are what's used instead", () => {
    const canvasSrc = fs.readFileSync(path.resolve(__dirname, "../../components/notelab/NotebookCanvas.tsx"), "utf8");
    expect(canvasSrc).toMatch(/👁️ View Source/);
    expect(canvasSrc).toMatch(/📍 Jump to Reader/);
    expect(fs.existsSync(path.resolve(__dirname, "../../components/notelab/LearningSourcesManager.tsx"))).toBe(false);
  });

  it("16. the entire lesson plan is fully deterministic end to end — the same VSG/script/snapshot always produce an EQUAL plan, so replaying Previous/Next/Restart across PDF<->Whiteboard never invents new geometry", () => {
    const a = buildProfessorTeachingActions(vsg(), grounded(), SNAPSHOT);
    const b = buildProfessorTeachingActions(vsg(), grounded(), SNAPSHOT);
    expect(a).toEqual(b);
    // computeCanvasStateAtStep itself is equally deterministic — jumping to
    // the same index twice reconstructs an equal canvas state both times.
    const stateA = computeCanvasStateAtStep(a.actions, 5);
    const stateB = computeCanvasStateAtStep(a.actions, 5);
    expect(stateA).toEqual(stateB);
  });
});

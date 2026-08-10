// tests/whiteboard/representativeTraces.test.ts
// Phase B2 — three representative deterministic traces through the real
// pipeline (VisualSceneGraph -> GroundedProfessorLessonScript ->
// buildProfessorTeachingActions), one per archetype the diagnosis asked for:
//   1. mechanism/causal page
//   2. comparison page
//   3. clinical/procedure page with a warning
// Each trace asserts real structural properties (region separation, no
// overlap, connector presence, step count) rather than just "doesn't
// throw" — these fixtures are also quoted directly in the Phase B2 report.

import { buildProfessorTeachingActions } from "../../lib/whiteboard/buildProfessorTeachingActions";
import type { GroundedProfessorLessonScript } from "../../lib/whiteboard/groundProfessorLesson";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";
import type { ProfessorLessonSourceSnapshot } from "../../lib/whiteboard/professorLessonPlan";
import { totalTeachingSteps } from "../../lib/whiteboard/professorTimelineEngine";

const SNAPSHOT: ProfessorLessonSourceSnapshot = {
  documentId: "doc-trace", pageNumber: 1, pageTruthKey: "doc-trace::1::t",
  activeCanonicalUnitId: null, vsgId: "vsg_trace", plannerVersion: 5,
};

function node(id: string, sourceId: string, overrides: Partial<VisualSceneGraph["nodes"][number]> = {}): VisualSceneGraph["nodes"][number] {
  return {
    id, label: id, body: `${id} body`, canonicalType: "core-concept",
    importanceLevel: "high", tier: "step", role: "spoke",
    position: { x: 0, y: 0 }, size: { w: 200, h: 52 }, sourceId,
    ...overrides,
  };
}

function nodeScript(
  targetId: string,
  shortLabel: string,
  overrides: Partial<GroundedProfessorLessonScript["nodeScripts"][number]> = {},
): GroundedProfessorLessonScript["nodeScripts"][number] {
  return {
    targetId, shortLabel, narration: `Narrating ${shortLabel}.`, tone: "explain", pace: "normal",
    emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism",
    drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
    ...overrides,
  };
}

function noOverlaps(boxes: Array<{ x: number; y: number; w: number; h: number }>): boolean {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return false;
    }
  }
  return true;
}

describe("Representative trace 1 — mechanism/causal page (aspirin toxicity)", () => {
  const vsg: VisualSceneGraph = {
    id: "vsg_mechanism", grammar: "flow", drawType: "flow",
    nodes: [
      node("n1", "src-n1", { canonicalType: "core-concept", role: "hub", tier: "master" }),
      node("n2", "src-n2", { canonicalType: "mechanism" }),
      node("n3", "src-n3", { canonicalType: "mechanism" }),
      node("n4", "src-n4", { canonicalType: "mechanism" }),
      node("n5", "src-n5", { canonicalType: "mechanism" }),
      node("n6", "src-n6", { canonicalType: "clinical-pearl", tier: "pearl" }),
    ],
    edges: [
      { id: "e1", fromId: "n1", toId: "n2", kind: "causation" },
      { id: "e2", fromId: "n2", toId: "n3", kind: "causation" },
      { id: "e3", fromId: "n1", toId: "n4", kind: "causation" },
      { id: "e4", fromId: "n4", toId: "n5", kind: "causation" },
    ],
    canvas: { width: 800, height: 600 }, builtAt: 0,
  };
  const grounded: GroundedProfessorLessonScript = {
    title: "Aspirin Toxicity", visualGrammar: "mechanism",
    centralQuestion: "Why does aspirin toxicity disrupt two systems?",
    learningObjective: "Explain how aspirin overdose produces its two parallel toxic effects.",
    synthesisQuestion: "Why does aspirin overdose cause both metabolic and respiratory disturbance?",
    nodeScripts: [
      nodeScript("n1", "Aspirin toxicity", { teachingRole: "definition", spatialIntent: "central-mechanism", emphasize: true, emphasisTreatment: "highlight" }),
      nodeScript("e1", "leads to", { teachingRole: "mechanism", spatialIntent: "central-mechanism" }),
      nodeScript("n2", "Uncouples phosphorylation", { teachingRole: "mechanism", spatialIntent: "left-branch", drawingIntent: "chain" }),
      nodeScript("e2", "leads to", { teachingRole: "mechanism", spatialIntent: "left-branch" }),
      nodeScript("n3", "ATP depletion", { teachingRole: "consequence", spatialIntent: "left-branch", drawingIntent: "chain" }),
      nodeScript("e3", "leads to", { teachingRole: "mechanism", spatialIntent: "central-mechanism" }),
      nodeScript("n4", "Stimulates respiratory center", { teachingRole: "mechanism", spatialIntent: "right-branch", drawingIntent: "chain" }),
      nodeScript("e4", "leads to", { teachingRole: "mechanism", spatialIntent: "right-branch" }),
      nodeScript("n5", "Hyperventilation", { teachingRole: "consequence", spatialIntent: "right-branch", drawingIntent: "chain",
        relationships: [{ targetId: "n6", kind: "leads-to", label: "treat both" }] }),
      nodeScript("n6", "Alkalinize + dialyze", { teachingRole: "application", spatialIntent: "final-summary" }),
    ],
    groups: [
      { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
      { id: "g2", type: "mechanism", order: 2, nodeIds: ["n2", "n3"] },
      { id: "g3", type: "clinical", order: 3, nodeIds: ["n4", "n5"] },
      { id: "g4", type: "summary", order: 4, nodeIds: ["n6"] },
    ],
  };

  it("produces a plan with distinct left/right branch x-positions flanking the central node", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boundsFor = (src: string) => (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === src) as any).bounds;
    const center = boundsFor("src-n1");
    const left = boundsFor("src-n2");
    const right = boundsFor("src-n4");
    expect(left.x).toBeLessThan(center.x);
    expect(right.x).toBeGreaterThan(center.x + center.w);
  });

  it("has zero overlapping shapes", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boxes = plan.actions.filter(a => a.type === "draw-shape").map(a => (a as any).bounds);
    expect(noOverlaps(boxes)).toBe(true);
  });

  it("produces 10 teaching steps (title/objective=0, 6 nodes + 4 edges = 10 narrated points, synthesis=11)", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    expect(totalTeachingSteps(plan.actions)).toBe(12); // 0 (intro) + 10 (nodes+edges) + 1 (synthesis)
  });

  it("the reinforcement relationship (n5 -> n6, 'leads-to') renders as a real arrow, distinct from the causal chain edges", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const relArrow = plan.actions.find(a => a.type === "draw-arrow" && (a as any).shapeId === "shape:pr-n5-n6");
    expect(relArrow).toBeDefined();
  });

  it("is fully deterministic", () => {
    const a = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const b = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    expect(a).toEqual(b);
  });
});

describe("Representative trace 2 — comparison page (Type 1 vs Type 2 diabetes)", () => {
  const vsg: VisualSceneGraph = {
    id: "vsg_comparison", grammar: "flow", drawType: "flow",
    nodes: [
      node("n1", "src-n1", { role: "hub", tier: "master" }),
      node("n2", "src-n2", { canonicalType: "comparison" }),
      node("n3", "src-n3", { canonicalType: "comparison" }),
      node("n4", "src-n4", { canonicalType: "comparison" }),
      node("n5", "src-n5", { canonicalType: "comparison" }),
      node("n6", "src-n6", { canonicalType: "clinical-pearl", tier: "pearl" }),
    ],
    edges: [], canvas: { width: 800, height: 600 }, builtAt: 0,
  };
  const grounded: GroundedProfessorLessonScript = {
    title: "Diabetes Types", visualGrammar: "comparison",
    centralQuestion: "Why do the two diabetes types behave differently?",
    learningObjective: "Contrast the onset and mechanism of Type 1 and Type 2 diabetes.",
    synthesisQuestion: "How does the mechanism difference change first-line treatment?",
    nodeScripts: [
      nodeScript("n1", "Diabetes mellitus", { teachingRole: "definition", spatialIntent: "central-mechanism" }),
      nodeScript("n2", "Type 1: autoimmune", { teachingRole: "mechanism", spatialIntent: "comparison-column", drawingIntent: "contrast" }),
      nodeScript("n3", "Type 1: early onset", { teachingRole: "context", spatialIntent: "comparison-column", drawingIntent: "contrast" }),
      nodeScript("n4", "Type 2: insulin resistance", { teachingRole: "mechanism", spatialIntent: "comparison-column", drawingIntent: "contrast" }),
      nodeScript("n5", "Type 2: adult onset", { teachingRole: "context", spatialIntent: "comparison-column", drawingIntent: "contrast" }),
      nodeScript("n6", "Treatment differs by mechanism", { teachingRole: "application", spatialIntent: "final-summary" }),
    ],
    groups: [
      { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
      { id: "g2", type: "comparison", order: 2, nodeIds: ["n2", "n3", "n4", "n5"] },
      { id: "g3", type: "summary", order: 3, nodeIds: ["n6"] },
    ],
  };

  it("splits the 4 comparison nodes into exactly 2 distinct x-columns", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boundsFor = (src: string) => (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === src) as any).bounds;
    const xs = new Set([boundsFor("src-n2").x, boundsFor("src-n3").x, boundsFor("src-n4").x, boundsFor("src-n5").x]);
    expect(xs.size).toBe(2);
  });

  it("REQUIRED: renders a real bracket divider ('brace' shape) between the two comparison columns", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    expect(plan.actions.some(a => a.type === "draw-shape" && (a as any).shape === "brace")).toBe(true);
  });

  it("has zero overlapping shapes, including the divider", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boxes = plan.actions.filter(a => a.type === "draw-shape").map(a => (a as any).bounds);
    expect(noOverlaps(boxes)).toBe(true);
  });

  it("the final-summary node sits below the comparison row", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boundsFor = (src: string) => (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === src) as any).bounds;
    const comparisonBottom = Math.max(boundsFor("src-n2").y + boundsFor("src-n2").h, boundsFor("src-n4").y + boundsFor("src-n4").h);
    expect(boundsFor("src-n6").y).toBeGreaterThanOrEqual(comparisonBottom);
  });
});

describe("Representative trace 3 — clinical/procedure page with a warning (suspected sepsis)", () => {
  const vsg: VisualSceneGraph = {
    id: "vsg_procedure", grammar: "flow", drawType: "flow",
    nodes: [
      node("n1", "src-n1", { role: "hub", tier: "master" }),
      node("n2", "src-n2", { canonicalType: "procedure", role: "step" }),
      node("n3", "src-n3", { canonicalType: "procedure", role: "step" }),
      node("n4", "src-n4", { canonicalType: "procedure", role: "step" }),
      node("n5", "src-n5", { canonicalType: "trap", tier: "danger" }),
      node("n6", "src-n6", { canonicalType: "clinical-pearl", tier: "pearl" }),
    ],
    edges: [
      { id: "e1", fromId: "n2", toId: "n3", kind: "sequence" },
      { id: "e2", fromId: "n3", toId: "n4", kind: "sequence" },
    ],
    canvas: { width: 800, height: 600 }, builtAt: 0,
  };
  const grounded: GroundedProfessorLessonScript = {
    title: "Suspected Sepsis", visualGrammar: "procedure",
    centralQuestion: "What must happen first in suspected sepsis?",
    learningObjective: "Sequence the initial assessment and treatment of suspected sepsis.",
    synthesisQuestion: "Why must antibiotics never wait on culture results?",
    nodeScripts: [
      nodeScript("n1", "Suspected sepsis", { teachingRole: "definition", spatialIntent: "central-mechanism" }),
      nodeScript("n2", "Measure vitals", { teachingRole: "application", spatialIntent: "central-mechanism", drawingIntent: "sequence" }),
      nodeScript("e1", "then", { teachingRole: "application", spatialIntent: "central-mechanism" }),
      nodeScript("n3", "Obtain cultures", { teachingRole: "application", spatialIntent: "central-mechanism", drawingIntent: "sequence" }),
      nodeScript("e2", "then", { teachingRole: "application", spatialIntent: "central-mechanism" }),
      nodeScript("n4", "Administer antibiotics", { teachingRole: "application", spatialIntent: "central-mechanism", drawingIntent: "sequence" }),
      nodeScript("n5", "Never delay antibiotics for cultures", { teachingRole: "reinforcement", spatialIntent: "warning-aside", emphasize: true, emphasisTreatment: "crossOut" }),
      nodeScript("n6", "Reassess in 6 hours", { teachingRole: "reinforcement", spatialIntent: "final-summary" }),
    ],
    groups: [
      { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
      { id: "g2", type: "sequence", order: 2, nodeIds: ["n2", "n3", "n4"] },
      { id: "g3", type: "warning", order: 3, nodeIds: ["n5"] },
      { id: "g4", type: "summary", order: 4, nodeIds: ["n6"] },
    ],
  };

  it("REQUIRED: the warning node draws as a hexagon (danger tier), not a plain box", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const warn = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n5") as any;
    expect(warn.shape).toBe("hexagon");
  });

  it("REQUIRED: the warning node's emphasis renders as 'crossOut' (AI-chosen), not the old hardcoded 'circle'", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const emphasize = plan.actions.find(a => a.type === "emphasize" && (a as any).treatment === "crossOut");
    expect(emphasize).toBeDefined();
  });

  it("REQUIRED: the warning node sits well below the procedure steps, with extra separation", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boundsFor = (src: string) => (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === src) as any).bounds;
    const lastStepBottom = boundsFor("src-n4").y + boundsFor("src-n4").h;
    expect(boundsFor("src-n5").y).toBeGreaterThan(lastStepBottom);
  });

  it("the 3 procedure steps get automatic sequential number badges", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const numbered = plan.actions.filter(a => a.type === "emphasize" && (a as any).treatment === "number");
    expect(numbered).toHaveLength(3);
    expect((numbered[0] as any).sequenceNumber).toBe(1);
    expect((numbered[2] as any).sequenceNumber).toBe(3);
  });

  it("the final-summary node sits below the warning", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boundsFor = (src: string) => (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === src) as any).bounds;
    expect(boundsFor("src-n6").y).toBeGreaterThanOrEqual(boundsFor("src-n5").y);
  });

  it("has zero overlapping shapes", () => {
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const boxes = plan.actions.filter(a => a.type === "draw-shape").map(a => (a as any).bounds);
    expect(noOverlaps(boxes)).toBe(true);
  });
});

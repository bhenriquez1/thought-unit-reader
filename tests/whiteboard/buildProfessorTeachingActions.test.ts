// tests/whiteboard/buildProfessorTeachingActions.test.ts
import { buildProfessorTeachingActions } from "../../lib/whiteboard/buildProfessorTeachingActions";
import type { GroundedProfessorLessonScript } from "../../lib/whiteboard/groundProfessorLesson";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";
import type { ProfessorLessonSourceSnapshot } from "../../lib/whiteboard/professorLessonPlan";

function makeVsg(): VisualSceneGraph {
  return {
    id: "vsg_test", grammar: "flow", drawType: "flow",
    nodes: [
      { id: "n1", label: "n1", body: "n1 body", canonicalType: "definition", importanceLevel: "critical", tier: "master", role: "step", position: { x: 85, y: 22 }, size: { w: 290, h: 52 }, sourceId: "src-n1" },
      { id: "n2", label: "n2", body: "n2 body", canonicalType: "procedure", importanceLevel: "high", tier: "step", role: "step", position: { x: 85, y: 104 }, size: { w: 290, h: 52 }, sourceId: "src-n2" },
    ],
    edges: [{ id: "e1", fromId: "n1", toId: "n2", kind: "sequence", label: "leads to" }],
    canvas: { width: 460, height: 300 }, builtAt: 0,
  };
}

function makeGrounded(overrides: Partial<GroundedProfessorLessonScript> = {}): GroundedProfessorLessonScript {
  return {
    title: "Test Lesson",
    visualGrammar: "procedure",
    centralQuestion: "Why must stabilization come first?",
    learningObjective: "Explain how to stabilize the patient before diagnosis.",
    synthesisQuestion: "How would you explain this back?",
    nodeScripts: [
      { targetId: "n1", shortLabel: "Rapid assessment", narration: "Start with the central problem.", tone: "introduce", pace: "normal", emphasize: true, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "circle", relationships: [], explain: [] },
      { targetId: "e1", shortLabel: "Leads to", narration: "This leads directly to stabilization.", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      { targetId: "n2", shortLabel: "Stabilize first", narration: "Stabilization comes before diagnosis.", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
    ],
    groups: [],
    ...overrides,
  };
}

const SNAPSHOT: ProfessorLessonSourceSnapshot = {
  documentId: "doc-1", pageNumber: 4, pageTruthKey: "doc-1::4::t",
  activeCanonicalUnitId: null, vsgId: "vsg_test", plannerVersion: 1,
};

function explainAction(overrides: Partial<{
  type: "write" | "icon" | "arrow" | "emphasize";
  id: string | null; text: string | null; icon: any; label: string | null;
  from: string | null; to: string | null; target: string | null; style: any;
}>) {
  return {
    type: "write" as const, id: null, text: null, icon: null, label: null,
    from: null, to: null, target: null, style: null,
    ...overrides,
  };
}

describe("buildProfessorTeachingActions — visuals synchronized with narration", () => {
  it("every node/edge produces a speak action immediately after its own visual actions, not batched at the end", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const types = plan.actions.map(a => a.type);
    // The title's write is immediately followed by its speak (+pause), not by
    // the next node's visuals — confirms interleaving, not two big blocks.
    const firstWriteIdx = types.indexOf("write");
    expect(types[firstWriteIdx + 1]).toBe("speak");
  });

  it("a node's speak action's linkedActionIds reference that same node's draw/write actions", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const drawAction = plan.actions.find(a => a.type === "draw-shape" && a.targetId === "src-n1");
    const writeAction = plan.actions.find(a => a.type === "write" && a.targetId === "src-n1");
    const segment = plan.segments.find(s => s.text === "Start with the central problem.");
    expect(segment).toBeDefined();
    expect(segment!.linkedActionIds).toContain((drawAction as any).actionId);
    expect(segment!.linkedActionIds).toContain((writeAction as any).actionId);
  });

  it("an emphasized node gets an emphasize action linked into its narration segment", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const emphasizeAction = plan.actions.find(a => a.type === "emphasize");
    expect(emphasizeAction).toBeDefined();
    const segment = plan.segments.find(s => s.linkedActionIds.includes((emphasizeAction as any).actionId));
    expect(segment).toBeDefined();
  });

  it("the synthesis question is spoken over a whole-board camera view, with no new diagram object", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const segment = plan.segments.find(s => s.text === "How would you explain this back?");
    expect(segment).toBeDefined();
    const linked = plan.actions.filter(a => segment!.linkedActionIds.includes(a.actionId));
    expect(linked).toHaveLength(1);
    expect(linked[0].type).toBe("move-camera");
  });

  it("writes the motivating central question before drawing the first concept", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const questionIndex = plan.actions.findIndex(a => a.type === "write" && a.text === "Why must stabilization come first?");
    const firstNodeIndex = plan.actions.findIndex(a => a.type === "draw-shape" && a.targetId === "src-n1");
    expect(questionIndex).toBeGreaterThanOrEqual(0);
    expect(questionIndex).toBeLessThan(firstNodeIndex);
    expect(plan.centralQuestion).toBe("Why must stabilization come first?");
  });
});

describe("buildProfessorTeachingActions — geometry is deterministic, never AI-proposed", () => {
  it("node box width grows to fit the short label instead of a fixed constant", () => {
    const shortGrounded = makeGrounded({ nodeScripts: [{ targetId: "n1", shortLabel: "X", narration: "n", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] }] });
    const longGrounded  = makeGrounded({ nodeScripts: [{ targetId: "n1", shortLabel: "A somewhat longer phrase here", narration: "n", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] }] });
    const shortPlan = buildProfessorTeachingActions(makeVsg(), shortGrounded, SNAPSHOT);
    const longPlan  = buildProfessorTeachingActions(makeVsg(), longGrounded, SNAPSHOT);
    const shortBounds = (shortPlan.actions.find(a => a.type === "draw-shape") as any).bounds;
    const longBounds  = (longPlan.actions.find(a => a.type === "draw-shape") as any).bounds;
    expect(longBounds.w).toBeGreaterThan(shortBounds.w);
  });

  it("every write/draw-shape action carries the node's sourceId as targetId — provenance preserved for click-sync", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const writeN1 = plan.actions.find(a => a.type === "write" && (a as any).text === "Rapid assessment");
    expect((writeN1 as any).targetId).toBe("src-n1");
  });

  it("skips an edge whose endpoint was never drawn (density-capped) rather than crashing", () => {
    const vsg = makeVsg();
    const grounded = makeGrounded({ nodeScripts: [{ targetId: "e1", shortLabel: "Leads to", narration: "n", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] }] });
    expect(() => buildProfessorTeachingActions(vsg, grounded, SNAPSHOT)).not.toThrow();
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    expect(plan.actions.some(a => a.type === "draw-arrow")).toBe(false);
  });

  it("REQUIRED: an edge script entry BETWEEN its two endpoints ('here's A... this leads to... here's B') still draws the arrow — a real bug where bounds were only computed when a node's OWN script entry was reached, so any edge mentioned before its 'to' node was silently dropped with no error, even though both endpoints ARE going to be drawn", () => {
    // makeGrounded()'s default nodeScripts order is exactly this shape:
    // [n1, e1, n2] — the edge sits between its own two endpoints, which is
    // also the natural conversational order rule 3 of the AI prompt asks
    // for ("connect... explaining why two points relate").
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    expect(plan.actions.some(a => a.type === "draw-arrow")).toBe(true);
  });

  it("is deterministic — same vsg/script/snapshot always produce an equal plan", () => {
    const a = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const b = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    expect(a).toEqual(b);
  });

  it("carries the source snapshot through unchanged, for cache-identity checks", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    expect(plan.sourceSnapshot).toEqual(SNAPSHOT);
  });
});

describe("buildProfessorTeachingActions — a move-camera action precedes each node/edge group", () => {
  it("inserts a move-camera action before the first node's draw-shape", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const drawIdx = plan.actions.findIndex(a => a.type === "draw-shape");
    expect(plan.actions[drawIdx - 1].type).toBe("move-camera");
  });
});

describe("buildProfessorTeachingActions — Director camera follows each active teaching step", () => {
  it("emits one camera request for each visual node/edge step plus the final overview", () => {
    const grounded = makeGrounded({ groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }] });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    expect(plan.actions.filter(a => a.type === "move-camera")).toHaveLength(4);
  });

  it("does not collapse distinct active steps merely because they share or change groups", () => {
    const grounded = makeGrounded({
      groups: [
        { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
        { id: "g2", type: "sequence", order: 2, nodeIds: ["n2"] },
      ],
    });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    expect(plan.actions.filter(a => a.type === "move-camera")).toHaveLength(4);
  });

  it("never targets an unrevealed future concept", () => {
    const grounded = makeGrounded({ groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }] });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const cameraAction = plan.actions.find(a => a.type === "move-camera") as any;
    const n1Shape = (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any).shapeId;
    const n2Shape = (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n2") as any).shapeId;
    expect(cameraAction.targetIds).toContain(n1Shape);
    expect(cameraAction.targetIds).not.toContain(n2Shape);
    expect(cameraAction.focusBounds).toBeDefined();
  });
});

describe("buildProfessorTeachingActions — group-aware geometry: no overlap, real measured sizing", () => {
  function makeFiveNodeVsg(): VisualSceneGraph {
    return {
      id: "vsg_groups", grammar: "flow", drawType: "flow",
      nodes: Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`, label: `n${i}`, body: "b", canonicalType: "core-concept",
        importanceLevel: "high", tier: "step", role: "step",
        position: { x: 0, y: i * 80 }, size: { w: 290, h: 52 }, sourceId: `src-n${i}`,
      })),
      edges: [], canvas: { width: 460, height: 500 }, builtAt: 0,
    };
  }
  function groupedGrounded(): GroundedProfessorLessonScript {
    return {
      title: "T", visualGrammar: "concept-map", centralQuestion: "How are these connected?", learningObjective: "L", synthesisQuestion: "Q",
      nodeScripts: Array.from({ length: 5 }, (_, i) => ({
        targetId: `n${i}`, shortLabel: `Point number ${i} with a somewhat longer descriptive phrase`,
        narration: `Narration ${i}.`, tone: "explain" as const, pace: "normal" as const, emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
      })),
      groups: [
        { id: "g1", type: "core", order: 1, nodeIds: ["n0"] },
        { id: "g2", type: "mechanism", order: 2, nodeIds: ["n1", "n2"] },
        { id: "g3", type: "sequence", order: 3, nodeIds: ["n3", "n4"] },
      ],
    };
  }

  it("no two drawn shapes' bounds overlap — the direct fix for 'shapes overlap, labels cross'", () => {
    const plan = buildProfessorTeachingActions(makeFiveNodeVsg(), groupedGrounded(), SNAPSHOT);
    const boxes = plan.actions.filter(a => a.type === "draw-shape").map(a => (a as any).bounds);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("regions are placed in group.order sequence — group 1's nodes are above group 3's nodes", () => {
    const plan = buildProfessorTeachingActions(makeFiveNodeVsg(), groupedGrounded(), SNAPSHOT);
    const boundsFor = (id: string) => (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === `src-${id}`) as any).bounds;
    expect(boundsFor("n0").y).toBeLessThan(boundsFor("n3").y);
  });
});

describe("buildProfessorTeachingActions — deterministic, non-AI treatments from VSG data (never model-chosen)", () => {
  function makeSequentialVsg(): VisualSceneGraph {
    return {
      id: "vsg_seq", grammar: "flow", drawType: "flow",
      nodes: [
        { id: "n1", label: "Step one", body: "body", canonicalType: "procedure", importanceLevel: "high", tier: "step", role: "step", position: { x: 85, y: 22 }, size: { w: 290, h: 52 }, sourceId: "src-n1" },
        { id: "n2", label: "Step two", body: "body", canonicalType: "procedure", importanceLevel: "high", tier: "step", role: "step", position: { x: 85, y: 104 }, size: { w: 290, h: 52 }, sourceId: "src-n2" },
        { id: "n3", label: "Danger point", body: "body", canonicalType: "trap", importanceLevel: "high", tier: "danger", role: "spoke", position: { x: 85, y: 186 }, size: { w: 290, h: 52 }, sourceId: "src-n3" },
      ],
      edges: [], canvas: { width: 460, height: 400 }, builtAt: 0,
    };
  }
  function seqGrounded(): GroundedProfessorLessonScript {
    return {
      title: "Test", visualGrammar: "procedure", centralQuestion: "What is the sequence?", learningObjective: "Learn the steps.",
      synthesisQuestion: "Explain the steps back.",
      nodeScripts: [
        { targetId: "n1", shortLabel: "Step one", narration: "First.", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "n2", shortLabel: "Step two", narration: "Second.", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "n3", shortLabel: "Watch out", narration: "Common mistake here.", tone: "warn", pace: "slow", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      ],
      groups: [],
    };
  }

  it("step-role nodes get an automatic 'number' emphasize action, numbered in order — 'draw the five numbered stages'", () => {
    const plan = buildProfessorTeachingActions(makeSequentialVsg(), seqGrounded(), SNAPSHOT);
    const numberActions = plan.actions.filter(a => a.type === "emphasize" && a.treatment === "number");
    expect(numberActions).toHaveLength(2);
    expect((numberActions[0] as any).sequenceNumber).toBe(1);
    expect((numberActions[1] as any).sequenceNumber).toBe(2);
  });

  it("danger-tier nodes get an automatic 'highlight' emphasize action — 'a small warning beside the common diagnostic error'", () => {
    const plan = buildProfessorTeachingActions(makeSequentialVsg(), seqGrounded(), SNAPSHOT);
    const highlightActions = plan.actions.filter(a => a.type === "emphasize" && a.treatment === "highlight");
    expect(highlightActions).toHaveLength(1);
    expect((highlightActions[0] as any).targetId).toBe(String((plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n3") as any).shapeId));
  });

  it("these deterministic treatments are NOT driven by the AI script — absent from ProfessorNodeScript, derived purely from node.role/node.tier", () => {
    const grounded = seqGrounded();
    for (const entry of grounded.nodeScripts) {
      expect(entry).not.toHaveProperty("treatment");
    }
    // Yet the plan still carries number/highlight actions, proving they came
    // from the VSG's own role/tier data, not from anything the script said.
    const plan = buildProfessorTeachingActions(makeSequentialVsg(), grounded, SNAPSHOT);
    expect(plan.actions.some(a => a.type === "emphasize" && a.treatment === "number")).toBe(true);
    expect(plan.actions.some(a => a.type === "emphasize" && a.treatment === "highlight")).toBe(true);
  });
});

describe("buildProfessorTeachingActions — learningObjective is spoken right after the title", () => {
  it("produces a segment for the learningObjective, before any node's narration", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const objectiveIdx = plan.segments.findIndex(s => s.text === makeGrounded().learningObjective);
    const titleIdx = plan.segments.findIndex(s => s.text === `${makeGrounded().title}.`);
    const firstNodeNarrationIdx = plan.segments.findIndex(s => s.text === makeGrounded().nodeScripts[0].narration);
    expect(objectiveIdx).toBeGreaterThan(-1);
    expect(objectiveIdx).toBeGreaterThan(titleIdx);
    expect(objectiveIdx).toBeLessThan(firstNodeNarrationIdx);
  });

  it("carries learningObjective through onto the final plan", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    expect(plan.learningObjective).toBe(makeGrounded().learningObjective);
  });
});

describe("buildProfessorTeachingActions — shape vocabulary: a decision/danger/pearl node gets its OWN shape, not just a rectangle in a different color", () => {
  function makeVariedVsg(): VisualSceneGraph {
    return {
      id: "vsg_shapes", grammar: "flow", drawType: "flow",
      nodes: [
        { id: "hub",      label: "hub",      body: "b", canonicalType: "definition",         importanceLevel: "critical",  tier: "master",   role: "hub",     position: { x: 85, y: 22 },  size: { w: 200, h: 52 }, sourceId: "src-hub" },
        { id: "decision", label: "decision", body: "b", canonicalType: "decision",            importanceLevel: "high",      tier: "decision", role: "spoke",   position: { x: 85, y: 104 }, size: { w: 290, h: 52 }, sourceId: "src-decision" },
        { id: "trap",     label: "trap",     body: "b", canonicalType: "trap",                importanceLevel: "high",      tier: "danger",   role: "spoke",   position: { x: 85, y: 186 }, size: { w: 290, h: 52 }, sourceId: "src-trap" },
        { id: "pearl",    label: "pearl",    body: "b", canonicalType: "clinicalPearl",       importanceLevel: "reference", tier: "pearl",    role: "spoke",   position: { x: 85, y: 268 }, size: { w: 290, h: 52 }, sourceId: "src-pearl" },
        { id: "step",     label: "step",     body: "b", canonicalType: "procedure",           importanceLevel: "high",      tier: "step",     role: "step",    position: { x: 85, y: 350 }, size: { w: 290, h: 52 }, sourceId: "src-step" },
      ],
      edges: [], canvas: { width: 460, height: 500 }, builtAt: 0,
    };
  }
  function variedGrounded(): GroundedProfessorLessonScript {
    return {
      title: "Test", visualGrammar: "procedure", centralQuestion: "How does this work?", learningObjective: "Learn.", synthesisQuestion: "Explain back.",
      nodeScripts: [
        { targetId: "hub",      shortLabel: "Hub",      narration: "Hub.",      tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "decision", shortLabel: "Decision", narration: "Decide.",   tone: "explain",   pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "trap",     shortLabel: "Trap",     narration: "Careful.",  tone: "warn",       pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "pearl",    shortLabel: "Pearl",    narration: "Insight.",  tone: "connect",    pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "step",     shortLabel: "Step",     narration: "Do this.",  tone: "explain",    pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      ],
      groups: [],
    };
  }

  function shapeFor(sourceId: string, plan = buildProfessorTeachingActions(makeVariedVsg(), variedGrounded(), SNAPSHOT)) {
    const action = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === sourceId);
    return (action as any)?.shape;
  }

  it("REQUIRED: a hub-role node draws as a circle", () => {
    expect(shapeFor("src-hub")).toBe("circle");
  });

  it("REQUIRED: a decision-tier/canonicalType node draws as a diamond — the standard flowchart decision symbol", () => {
    expect(shapeFor("src-decision")).toBe("diamond");
  });

  it("REQUIRED: a danger-tier (trap) node draws as a hexagon, not a rectangle with just a different border color", () => {
    expect(shapeFor("src-trap")).toBe("hexagon");
  });

  it("REQUIRED: a pearl-tier (clinical insight) node draws as a cloud", () => {
    expect(shapeFor("src-pearl")).toBe("cloud");
  });

  it("a plain step/procedure node still draws as a box (the sensible default for a process step)", () => {
    expect(shapeFor("src-step")).toBe("box");
  });

  it("REQUIRED: the 5 nodes above produce at least 4 DISTINCT shape kinds on one lesson — the concrete fix for 'everything renders as the same bordered box'", () => {
    const plan = buildProfessorTeachingActions(makeVariedVsg(), variedGrounded(), SNAPSHOT);
    const shapes = new Set(["src-hub", "src-decision", "src-trap", "src-pearl", "src-step"].map(id => shapeFor(id, plan)));
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });
});

describe("buildProfessorTeachingActions — edge arrows carry a targetId and a short deterministic label", () => {
  it("REQUIRED: a draw-arrow action's targetId is the edge's own id — previously arrows carried no targetId at all, leaving TldrawCanvas's EDGE_COLOR permanently dead code", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const arrow = plan.actions.find(a => a.type === "draw-arrow");
    expect(arrow).toBeDefined();
    expect((arrow as any).targetId).toBe("e1");
  });

  it("REQUIRED: a 'sequence'-kind edge gets a short deterministic label ('then') as its own write action, positioned at the arrow's midpoint", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const arrowAction = plan.actions.find(a => a.type === "draw-arrow") as any;
    const labelAction = plan.actions.find(a => a.type === "write" && a.text === "then") as any;
    expect(labelAction).toBeDefined();
    const midX = (arrowAction.from.x + arrowAction.to.x) / 2;
    const midY = (arrowAction.from.y + arrowAction.to.y) / 2;
    expect(labelAction.y).toBeCloseTo(midY - 8, 0);
    // x is midX minus HALF the label's own estimated width (centering, not
    // an exact pixel match since width depends on estimateLabelWidth) — a
    // short 4-char label like "then" is well under 100px wide either way.
    expect(Math.abs(labelAction.x - midX)).toBeLessThan(100);
  });

  it("uses an informative AI-authored edge label when it explains why the causal arrow exists", () => {
    const grounded = makeGrounded({
      nodeScripts: makeGrounded().nodeScripts.map(entry =>
        entry.targetId === "e1" ? { ...entry, shortLabel: "prevents further harm" } : entry,
      ),
    });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    expect(plan.actions.some(a => a.type === "write" && a.text === "prevents further harm")).toBe(true);
    expect(plan.actions.some(a => a.type === "write" && a.text === "then")).toBe(false);
  });

  it("the edge label's action is linked into that edge's own narration segment", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const labelAction = plan.actions.find(a => a.type === "write" && a.text === "then") as any;
    const segment = plan.segments.find(s => s.text === "This leads directly to stabilization.");
    expect(segment).toBeDefined();
    expect(segment!.linkedActionIds).toContain(labelAction.actionId);
  });

  it("every EDGE_KIND_LABEL value is short (<=3 words) — an arrow label is a connective phrase, not another sentence to read", () => {
    // Exercise all 5 kinds via 5 one-edge VSGs, confirming each produces a short label.
    const kinds = ["sequence", "causation", "contrast", "elaboration", "reference"] as const;
    for (const kind of kinds) {
      const vsg: VisualSceneGraph = {
        id: `vsg_${kind}`, grammar: "flow", drawType: "flow",
        nodes: [
          { id: "n1", label: "n1", body: "b", canonicalType: "definition", importanceLevel: "critical", tier: "master", role: "step", position: { x: 85, y: 22 }, size: { w: 290, h: 52 }, sourceId: "src-n1" },
          { id: "n2", label: "n2", body: "b", canonicalType: "procedure", importanceLevel: "high", tier: "step", role: "step", position: { x: 85, y: 104 }, size: { w: 290, h: 52 }, sourceId: "src-n2" },
        ],
        edges: [{ id: "e1", fromId: "n1", toId: "n2", kind }],
        canvas: { width: 460, height: 300 }, builtAt: 0,
      };
      const grounded: GroundedProfessorLessonScript = {
        title: "T", visualGrammar: "procedure", centralQuestion: "How does this proceed?", learningObjective: "L", synthesisQuestion: "Q",
        nodeScripts: [
          { targetId: "n1", shortLabel: "A", narration: "A.", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
          { targetId: "e1", shortLabel: "B", narration: "B.", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
          { targetId: "n2", shortLabel: "C", narration: "C.", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        ],
        groups: [],
      };
      const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
      const arrow = plan.actions.find(a => a.type === "draw-arrow") as any;
      const label = plan.actions.find(a => a.type === "write" && a.shapeId === `shape:pe-label-${arrow.targetId}`) as any;
      expect(label).toBeDefined();
      expect(label.text.split(/\s+/).length).toBeLessThanOrEqual(3);
    }
  });
});

describe("buildProfessorTeachingActions — explain[]: the professor's-aside mini-diagram", () => {
  function groundedWithExplain(explain: ReturnType<typeof explainAction>[]) {
    return makeGrounded({
      nodeScripts: [
        { targetId: "n1", shortLabel: "Hypothermia", narration: "Cold slows things down.", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain },
        { targetId: "n2", shortLabel: "Stabilize first", narration: "Stabilization comes before diagnosis.", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      ],
    });
  }

  it("a write action produces its own draw-shape + write pair, distinct from the primary node's shapes", () => {
    const grounded = groundedWithExplain([explainAction({ type: "write", id: "metabolism", text: "less metabolism" })]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const explainWrite = plan.actions.find(a => a.type === "write" && (a as any).text === "less metabolism");
    expect(explainWrite).toBeDefined();
    const explainDraw = plan.actions.find(a => a.type === "draw-shape" && (a as any).shapeId === (explainWrite as any).shapeId);
    expect(explainDraw).toBeDefined();
    expect((explainDraw as any).shapeId).not.toBe((plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any).shapeId);
  });

  it("an icon action renders as a circle carrying the mapped glyph as its write text", () => {
    const grounded = groundedWithExplain([explainAction({ type: "icon", id: "temp", icon: "thermometer" })]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const iconDraw = plan.actions.find(a => a.type === "draw-shape" && (a as any).shape === "circle" && (a as any).targetId === undefined);
    expect(iconDraw).toBeDefined();
    const iconWrite = plan.actions.find(a => a.type === "write" && (a as any).shapeId === (iconDraw as any).shapeId);
    expect((iconWrite as any).text).toContain("🌡️");
  });

  it("an arrow from 'self' connects the primary node's own shape to a declared local id", () => {
    const grounded = groundedWithExplain([
      explainAction({ type: "write", id: "metabolism", text: "less metabolism" }),
      explainAction({ type: "arrow", from: "self", to: "metabolism" }),
    ]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const primaryDraw = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any;
    const subDraw = plan.actions.find(a => a.type === "draw-shape" && (a as any).shape === "box" && (a as any).targetId === undefined) as any;
    const arrows = plan.actions.filter(a => a.type === "draw-arrow") as any[];
    // One arrow anchored near the primary box, one anchored near the sub-box.
    const explainArrow = arrows.find(a => a.targetId === undefined);
    expect(explainArrow).toBeDefined();
    const nearPrimary = (p: { x: number; y: number }) => Math.abs(p.x - (primaryDraw.bounds.x + primaryDraw.bounds.w / 2)) < primaryDraw.bounds.w;
    const nearSub = (p: { x: number; y: number }) => Math.abs(p.x - (subDraw.bounds.x + subDraw.bounds.w / 2)) < subDraw.bounds.w;
    expect(nearPrimary(explainArrow.from) || nearSub(explainArrow.from)).toBe(true);
    expect(nearPrimary(explainArrow.to) || nearSub(explainArrow.to)).toBe(true);
  });

  it("an emphasize action targeting a local id emphasizes that sub-shape's own shapeId, not the primary node", () => {
    const grounded = groundedWithExplain([
      explainAction({ type: "write", id: "metabolism", text: "less metabolism" }),
      explainAction({ type: "emphasize", target: "metabolism", style: "circle" }),
    ]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const subDraw = plan.actions.find(a => a.type === "draw-shape" && (a as any).shape === "box" && (a as any).targetId === undefined) as any;
    const primaryDraw = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any;
    const emphasizeActions = plan.actions.filter(a => a.type === "emphasize") as any[];
    expect(emphasizeActions.some(e => e.targetId === subDraw.shapeId && e.treatment === "circle")).toBe(true);
    // n1 is role:"step", so it DOES get its own deterministic "number"
    // emphasize — the assertion that matters is that the explain-declared
    // "circle" specifically landed on the sub-shape, not the primary node.
    expect(emphasizeActions.some(e => e.targetId === primaryDraw.shapeId && e.treatment === "circle")).toBe(false);
  });

  it("an emphasize action targeting 'self' emphasizes the primary node's own shape", () => {
    const grounded = groundedWithExplain([explainAction({ type: "emphasize", target: "self", style: "highlight" })]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const primaryDraw = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any;
    const emphasizeActions = plan.actions.filter(a => a.type === "emphasize") as any[];
    expect(emphasizeActions.some(e => e.targetId === primaryDraw.shapeId && e.treatment === "highlight")).toBe(true);
  });

  it("explain sub-shape bounds never overlap ANY primary node's bounds", () => {
    const grounded = groundedWithExplain([
      explainAction({ type: "write", id: "a", text: "less metabolism" }),
      explainAction({ type: "write", id: "b", text: "less oxygen demand" }),
    ]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const primaryBoxes = plan.actions
      .filter(a => a.type === "draw-shape" && (a as any).targetId !== undefined)
      .map(a => (a as any).bounds);
    const subBoxes = plan.actions
      .filter(a => a.type === "draw-shape" && (a as any).targetId === undefined)
      .map(a => (a as any).bounds);
    for (const sub of subBoxes) {
      for (const primary of primaryBoxes) {
        const overlap = sub.x < primary.x + primary.w && sub.x + sub.w > primary.x && sub.y < primary.y + primary.h && sub.y + sub.h > primary.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("every explain-generated action is linked into the SAME narration segment as its parent node's point", () => {
    const grounded = groundedWithExplain([
      explainAction({ type: "write", id: "metabolism", text: "less metabolism" }),
      explainAction({ type: "arrow", from: "self", to: "metabolism" }),
      explainAction({ type: "emphasize", target: "metabolism", style: "circle" }),
    ]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const segment = plan.segments.find(s => s.text === "Cold slows things down.")!;
    const explainWrite = plan.actions.find(a => a.type === "write" && (a as any).text === "less metabolism") as any;
    const explainArrow = plan.actions.find(a => a.type === "draw-arrow" && (a as any).targetId === undefined) as any;
    const explainEmphasize = plan.actions.find(a => a.type === "emphasize" && (a as any).treatment === "circle") as any;
    expect(segment.linkedActionIds).toContain(explainWrite.actionId);
    expect(segment.linkedActionIds).toContain(explainArrow.actionId);
    expect(segment.linkedActionIds).toContain(explainEmphasize.actionId);
  });

  it("a node with an empty explain[] produces no extra draw-shape/write actions beyond its own", () => {
    const grounded = groundedWithExplain([]);
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const drawShapes = plan.actions.filter(a => a.type === "draw-shape");
    // Exactly one draw-shape per primary node (n1, n2) — no explain extras.
    expect(drawShapes).toHaveLength(2);
  });

  it("is deterministic — the same explain[] input always produces an equal plan", () => {
    const grounded = groundedWithExplain([
      explainAction({ type: "write", id: "metabolism", text: "less metabolism" }),
      explainAction({ type: "arrow", from: "self", to: "metabolism" }),
    ]);
    const a = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const b = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    expect(a).toEqual(b);
  });
});

describe("buildProfessorTeachingActions — Director separates source reading from Professor explanation", () => {
  it("carries both SOURCE_VERBATIM and PROFESSOR_EXPLANATION segments without changing Current Page", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    expect(plan.segments.length).toBeGreaterThan(0);
    expect(plan.segments.some(s => s.contentRole === "SOURCE_VERBATIM")).toBe(true);
    expect(plan.segments.some(s => s.contentRole === "PROFESSOR_EXPLANATION")).toBe(true);
  });
});

describe("buildProfessorTeachingActions — Phase B2: every action carries a teaching-step id", () => {
  it("REQUIRED: title/learningObjective actions share stepId 0; each nodeScript/edge entry gets its own incrementing stepId", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const titleWrite = plan.actions.find(a => a.type === "write" && (a as any).text === "Test Lesson") as any;
    expect(titleWrite.stepId).toBe(0);

    const n1Draw = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any;
    const e1Arrow = plan.actions.find(a => a.type === "draw-arrow" && (a as any).targetId === "e1") as any;
    const n2Draw = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n2") as any;
    expect(n1Draw.stepId).toBe(1);
    // The Director holds an edge until both endpoint concepts exist, so no
    // connector reveals a future step early.
    expect(n2Draw.stepId).toBe(2);
    expect(e1Arrow.stepId).toBe(3);
  });

  it("every action belonging to ONE nodeScript entry (draw + write + emphasize + its speak/pause) shares the same stepId", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const n1StepId = (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any).stepId;
    const n1Write = plan.actions.find(a => a.type === "write" && (a as any).targetId === "src-n1") as any;
    const n1Emphasize = plan.actions.find(a => a.type === "emphasize" && (a as any).targetId === (plan.actions.find(x => x.type === "draw-shape" && (x as any).targetId === "src-n1") as any).shapeId) as any;
    expect(n1Write.stepId).toBe(n1StepId);
    expect(n1Emphasize.stepId).toBe(n1StepId);
  });

  it("the synthesis question's speak action gets the FINAL stepId, one past the last narrated point", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const lastNarratedStepId = (plan.actions.find(a => a.type === "draw-arrow" && (a as any).targetId === "e1") as any).stepId;
    const synthesisSpeak = plan.actions.find(a => a.type === "speak" && (a as any).text === "How would you explain this back?") as any;
    expect(synthesisSpeak.stepId).toBe(lastNarratedStepId + 1);
  });

  it("the final step first frames every primary concept, producing the compact integrated picture", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const synthesisSpeak = plan.actions.find(a => a.type === "speak" && a.text === "How would you explain this back?")!;
    const overview = plan.actions.find(a => a.type === "move-camera" && a.stepId === synthesisSpeak.stepId) as any;
    const primaryShapeIds = plan.actions
      .filter(a => a.type === "draw-shape" && a.targetId?.startsWith("src-"))
      .map(a => (a as any).shapeId);
    expect(overview.targetIds).toEqual(expect.arrayContaining(primaryShapeIds));
    expect(synthesisSpeak.actionId).not.toBe(overview.actionId);
  });
});

describe("buildProfessorTeachingActions — Phase B1: AI-authored fields survive onto the final action, never discarded", () => {
  it("REQUIRED: spatialIntent and teachingRole are carried onto that node's draw-shape action", () => {
    const grounded = makeGrounded({
      nodeScripts: [{
        targetId: "n1", shortLabel: "Rapid assessment", narration: "n", tone: "explain", pace: "normal", emphasize: false,
        teachingRole: "mechanism", spatialIntent: "warning-aside", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
      }],
    });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const drawAction = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any;
    expect(drawAction.teachingRole).toBe("mechanism");
    expect(drawAction.spatialIntent).toBe("warning-aside");
  });

  it("REQUIRED: drawingIntent influences shape choice for a plain (non-tier-locked) node — 'contrast' draws a diamond", () => {
    const grounded = makeGrounded({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "n", tone: "explain", pace: "normal", emphasize: false,
        teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "contrast", emphasisTreatment: "none", relationships: [], explain: [],
      }],
    });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const drawAction = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any;
    expect(drawAction.shape).toBe("diamond");
  });

  it("tier/role-derived shape rules still win over drawingIntent — a danger-tier node stays a hexagon even with drawingIntent:'contrast'", () => {
    const vsg = makeVsg();
    (vsg.nodes[0] as any).tier = "danger";
    const grounded = makeGrounded({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "n", tone: "warn", pace: "slow", emphasize: false,
        teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "contrast", emphasisTreatment: "none", relationships: [], explain: [],
      }],
    });
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const drawAction = plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any;
    expect(drawAction.shape).toBe("hexagon");
  });

  it("REQUIRED: emphasisTreatment 'crossOut' is used instead of the old hardcoded 'circle' for the winning emphasized point", () => {
    const grounded = makeGrounded({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "n", tone: "warn", pace: "slow", emphasize: true,
        teachingRole: "consequence", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "crossOut", relationships: [], explain: [],
      }],
    });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const emphasizeAction = plan.actions.find(a => a.type === "emphasize") as any;
    expect(emphasizeAction.treatment).toBe("crossOut");
  });
});

describe("buildProfessorTeachingActions — Phase B1: AI-authored relationships become real, deterministic arrows", () => {
  it("REQUIRED: a relationship between two narrated nodes produces a draw-arrow plus a labeled write", () => {
    const grounded = makeGrounded({
      nodeScripts: [
        {
          targetId: "n1", shortLabel: "First", narration: "n", tone: "explain", pace: "normal", emphasize: false,
          teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none",
          relationships: [{ targetId: "n2", kind: "warns-about", label: "check this first" }], explain: [],
        },
        { targetId: "n2", shortLabel: "Second", narration: "n2", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      ],
      groups: [],
    });
    // makeVsg()'s only edge is n1->n2 sequence — use a VSG with NO edges so
    // the relationship isn't deduped against a pre-existing structural one.
    const vsg = makeVsg();
    vsg.edges = [];
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const relArrow = plan.actions.find(a => a.type === "draw-arrow" && (a as any).shapeId === "shape:pr-n1-n2") as any;
    expect(relArrow).toBeDefined();
    expect(relArrow.relationshipKind).toBe("warns-about");
    const relLabel = plan.actions.find(a => a.type === "write" && (a as any).text === "check this first") as any;
    expect(relLabel).toBeDefined();
  });

  it("REQUIRED: a relationship duplicating an already-existing VSG edge between the same two nodes is skipped — no redundant second arrow", () => {
    // makeVsg()'s VSG already has edge n1->n2 (kind:'sequence') — include an
    // "e1" nodeScript entry too, since (like everywhere else in this file)
    // an edge is only drawn when the script explicitly narrates it.
    const grounded = makeGrounded({
      nodeScripts: [
        {
          targetId: "n1", shortLabel: "First", narration: "n", tone: "explain", pace: "normal", emphasize: false,
          teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none",
          relationships: [{ targetId: "n2", kind: "leads-to", label: null }], explain: [],
        },
        { targetId: "e1", shortLabel: "Leads to", narration: "e", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "n2", shortLabel: "Second", narration: "n2", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      ],
      groups: [],
    });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const relArrow = plan.actions.find(a => a.type === "draw-arrow" && (a as any).shapeId === "shape:pr-n1-n2");
    expect(relArrow).toBeUndefined();
    // The structural edge's own arrow (from the "e1" entry) still exists —
    // this isn't "no arrow at all," just no REDUNDANT second one.
    expect(plan.actions.some(a => a.type === "draw-arrow" && (a as any).targetId === "e1")).toBe(true);
  });

  it("a relationship targeting a node that was never drawn (density-capped) is simply skipped, never crashes", () => {
    const grounded = makeGrounded({
      nodeScripts: [{
        targetId: "n1", shortLabel: "First", narration: "n", tone: "explain", pace: "normal", emphasize: false,
        teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none",
        relationships: [{ targetId: "never-drawn", kind: "supports", label: null }], explain: [],
      }],
      groups: [],
    });
    const vsg = makeVsg();
    vsg.edges = [];
    expect(() => buildProfessorTeachingActions(vsg, grounded, SNAPSHOT)).not.toThrow();
    const plan = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    expect(plan.actions.some(a => a.type === "draw-arrow")).toBe(false);
  });

  it("is deterministic — the same relationships input always produces an equal plan", () => {
    const grounded = makeGrounded({
      nodeScripts: [
        {
          targetId: "n1", shortLabel: "First", narration: "n", tone: "explain", pace: "normal", emphasize: false,
          teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none",
          relationships: [{ targetId: "n2", kind: "supports", label: null }], explain: [],
        },
        { targetId: "n2", shortLabel: "Second", narration: "n2", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      ],
      groups: [],
    });
    const vsg = makeVsg();
    vsg.edges = [];
    const a = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    const b = buildProfessorTeachingActions(vsg, grounded, SNAPSHOT);
    expect(a).toEqual(b);
  });
});

describe("buildProfessorTeachingActions — Phase B1: comparison-group divider bracket", () => {
  function makeFourNodeVsg(): VisualSceneGraph {
    return {
      id: "vsg_cmp", grammar: "flow", drawType: "flow",
      nodes: Array.from({ length: 4 }, (_, i) => ({
        id: `n${i}`, label: `n${i}`, body: "b", canonicalType: "comparison",
        importanceLevel: "high", tier: "step", role: "spoke",
        position: { x: 0, y: i * 80 }, size: { w: 200, h: 52 }, sourceId: `src-n${i}`,
      })),
      edges: [], canvas: { width: 460, height: 400 }, builtAt: 0,
    };
  }
  function comparisonGrounded(): GroundedProfessorLessonScript {
    return {
      title: "T", visualGrammar: "comparison", centralQuestion: "How do these differ?", learningObjective: "L", synthesisQuestion: "Q",
      nodeScripts: Array.from({ length: 4 }, (_, i) => ({
        targetId: `n${i}`, shortLabel: `Point ${i}`, narration: `N${i}.`, tone: "explain" as const, pace: "normal" as const,
        emphasize: false, teachingRole: "context" as const, spatialIntent: "comparison-column" as const, drawingIntent: "contrast" as const,
        emphasisTreatment: "none" as const, relationships: [], explain: [],
      })),
      groups: [{ id: "cmp1", type: "comparison", order: 1, nodeIds: ["n0", "n1", "n2", "n3"] }],
    };
  }

  it("REQUIRED: a comparison group with >=2 drawn nodes gets a 'brace' divider shape", () => {
    const plan = buildProfessorTeachingActions(makeFourNodeVsg(), comparisonGrounded(), SNAPSHOT);
    const divider = plan.actions.find(a => a.type === "draw-shape" && (a as any).shape === "brace");
    expect(divider).toBeDefined();
  });

  it("the divider sits between the two comparison columns, not on top of either", () => {
    const plan = buildProfessorTeachingActions(makeFourNodeVsg(), comparisonGrounded(), SNAPSHOT);
    const divider = plan.actions.find(a => a.type === "draw-shape" && (a as any).shape === "brace") as any;
    const nodeBoxes = plan.actions.filter(a => a.type === "draw-shape" && (a as any).shape !== "brace").map(a => (a as any).bounds);
    for (const box of nodeBoxes) {
      const overlap = divider.bounds.x < box.x + box.w && divider.bounds.x + divider.bounds.w > box.x
        && divider.bounds.y < box.y + box.h && divider.bounds.y + divider.bounds.h > box.y;
      expect(overlap).toBe(false);
    }
  });

  it("a comparison group with only 1 drawn node does NOT get a divider — groupLayout.ts never split it into two columns", () => {
    const grounded = comparisonGrounded();
    grounded.nodeScripts = [grounded.nodeScripts[0]];
    grounded.groups = [{ id: "cmp1", type: "comparison", order: 1, nodeIds: ["n0"] }];
    const plan = buildProfessorTeachingActions(makeFourNodeVsg(), grounded, SNAPSHOT);
    expect(plan.actions.some(a => a.type === "draw-shape" && (a as any).shape === "brace")).toBe(false);
  });

  it("a non-comparison group never gets a divider", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    expect(plan.actions.some(a => a.type === "draw-shape" && (a as any).shape === "brace")).toBe(false);
  });
});

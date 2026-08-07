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
    learningObjective: "Explain how to stabilize the patient before diagnosis.",
    synthesisQuestion: "How would you explain this back?",
    nodeScripts: [
      { targetId: "n1", shortLabel: "Rapid assessment", narration: "Start with the central problem.", tone: "introduce", pace: "normal", emphasize: true },
      { targetId: "e1", shortLabel: "Leads to", narration: "This leads directly to stabilization.", tone: "connect", pace: "normal", emphasize: false },
      { targetId: "n2", shortLabel: "Stabilize first", narration: "Stabilization comes before diagnosis.", tone: "explain", pace: "normal", emphasize: false },
    ],
    groups: [],
    ...overrides,
  };
}

const SNAPSHOT: ProfessorLessonSourceSnapshot = {
  documentId: "doc-1", pageNumber: 4, pageTruthKey: "doc-1::4::t",
  activeCanonicalUnitId: null, vsgId: "vsg_test", plannerVersion: 1,
};

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

  it("the synthesis question is spoken with no new visual object", () => {
    const plan = buildProfessorTeachingActions(makeVsg(), makeGrounded(), SNAPSHOT);
    const segment = plan.segments.find(s => s.text === "How would you explain this back?");
    expect(segment).toBeDefined();
    expect(segment!.linkedActionIds).toEqual([]);
  });
});

describe("buildProfessorTeachingActions — geometry is deterministic, never AI-proposed", () => {
  it("node box width grows to fit the short label instead of a fixed constant", () => {
    const shortGrounded = makeGrounded({ nodeScripts: [{ targetId: "n1", shortLabel: "X", narration: "n", tone: "explain", pace: "normal", emphasize: false }] });
    const longGrounded  = makeGrounded({ nodeScripts: [{ targetId: "n1", shortLabel: "A somewhat longer phrase here", narration: "n", tone: "explain", pace: "normal", emphasize: false }] });
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
    const grounded = makeGrounded({ nodeScripts: [{ targetId: "e1", shortLabel: "Leads to", narration: "n", tone: "connect", pace: "normal", emphasize: false }] });
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

describe("buildProfessorTeachingActions — camera moves by teaching region, not per individual object", () => {
  it("two nodes in the SAME semantic group share a single move-camera action", () => {
    const grounded = makeGrounded({ groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }] });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    expect(plan.actions.filter(a => a.type === "move-camera")).toHaveLength(1);
  });

  it("a node in a DIFFERENT group from the previous one triggers a new move-camera action", () => {
    const grounded = makeGrounded({
      groups: [
        { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
        { id: "g2", type: "sequence", order: 2, nodeIds: ["n2"] },
      ],
    });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    expect(plan.actions.filter(a => a.type === "move-camera")).toHaveLength(2);
  });

  it("a region's move-camera action targets every shapeId in that region, not just the one node currently being drawn", () => {
    const grounded = makeGrounded({ groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }] });
    const plan = buildProfessorTeachingActions(makeVsg(), grounded, SNAPSHOT);
    const cameraAction = plan.actions.find(a => a.type === "move-camera") as any;
    const n1Shape = (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n1") as any).shapeId;
    const n2Shape = (plan.actions.find(a => a.type === "draw-shape" && (a as any).targetId === "src-n2") as any).shapeId;
    expect(cameraAction.targetIds).toEqual(expect.arrayContaining([n1Shape, n2Shape]));
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
      title: "T", visualGrammar: "concept-map", learningObjective: "L", synthesisQuestion: "Q",
      nodeScripts: Array.from({ length: 5 }, (_, i) => ({
        targetId: `n${i}`, shortLabel: `Point number ${i} with a somewhat longer descriptive phrase`,
        narration: `Narration ${i}.`, tone: "explain" as const, pace: "normal" as const, emphasize: false,
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
      title: "Test", visualGrammar: "procedure", learningObjective: "Learn the steps.",
      synthesisQuestion: "Explain the steps back.",
      nodeScripts: [
        { targetId: "n1", shortLabel: "Step one", narration: "First.", tone: "introduce", pace: "normal", emphasize: false },
        { targetId: "n2", shortLabel: "Step two", narration: "Second.", tone: "explain", pace: "normal", emphasize: false },
        { targetId: "n3", shortLabel: "Watch out", narration: "Common mistake here.", tone: "warn", pace: "slow", emphasize: false },
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
      title: "Test", visualGrammar: "procedure", learningObjective: "Learn.", synthesisQuestion: "Explain back.",
      nodeScripts: [
        { targetId: "hub",      shortLabel: "Hub",      narration: "Hub.",      tone: "introduce", pace: "normal", emphasize: false },
        { targetId: "decision", shortLabel: "Decision", narration: "Decide.",   tone: "explain",   pace: "normal", emphasize: false },
        { targetId: "trap",     shortLabel: "Trap",     narration: "Careful.",  tone: "warn",       pace: "normal", emphasize: false },
        { targetId: "pearl",    shortLabel: "Pearl",    narration: "Insight.",  tone: "connect",    pace: "normal", emphasize: false },
        { targetId: "step",     shortLabel: "Step",     narration: "Do this.",  tone: "explain",    pace: "normal", emphasize: false },
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
        title: "T", visualGrammar: "procedure", learningObjective: "L", synthesisQuestion: "Q",
        nodeScripts: [
          { targetId: "n1", shortLabel: "A", narration: "A.", tone: "introduce", pace: "normal", emphasize: false },
          { targetId: "e1", shortLabel: "B", narration: "B.", tone: "connect", pace: "normal", emphasize: false },
          { targetId: "n2", shortLabel: "C", narration: "C.", tone: "explain", pace: "normal", emphasize: false },
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

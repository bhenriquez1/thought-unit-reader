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
    synthesisQuestion: "How would you explain this back?",
    nodeScripts: [
      { targetId: "n1", shortLabel: "Rapid assessment", narration: "Start with the central problem.", tone: "introduce", pace: "normal", emphasize: true },
      { targetId: "e1", shortLabel: "Leads to", narration: "This leads directly to stabilization.", tone: "connect", pace: "normal", emphasize: false },
      { targetId: "n2", shortLabel: "Stabilize first", narration: "Stabilization comes before diagnosis.", tone: "explain", pace: "normal", emphasize: false },
    ],
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

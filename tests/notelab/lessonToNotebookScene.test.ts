// tests/notelab/lessonToNotebookScene.test.ts
// N5 — real behavioral tests for lib/notelab/lessonToNotebookScene.ts, the
// pure WhiteboardLessonSnapshot -> VisualNotebookScene recomposition. No
// DOM/IDB dependency (this function is deliberately pure), same discipline
// as tests/notelab/notebookLayout.test.ts and
// tests/knowledge/whiteboardLessonSnapshotStore.test.ts's own pure-builder
// coverage.
//
// What this guards, concretely: a lesson's real captured geometry (which
// shapes/labels/arrows Professor actually drew, per step) survives into the
// notebook scene instead of being discarded for flat prose — and every
// block stays inside the "AI proposes meaning, deterministic code resolves
// provenance" discipline: never a guessed canonicalUnitId, never a
// grounding-required primitive for non-verbatim content, always
// generatedFrom: "derived" (never "ai", since nothing here is a fresh model
// call).

import { buildNotebookSceneFromLessonSnapshot } from "../../lib/notelab/lessonToNotebookScene";
import { layoutNotebookScene } from "../../lib/notelab/notebookLayout";
import { GROUNDING_REQUIRED_PRIMITIVES } from "../../lib/notelab/notebookScene";
import type { WhiteboardLessonSnapshot, TeachingStepSummary } from "../../lib/knowledge/whiteboardLessonSnapshotStore";

function makeStep(overrides: Partial<TeachingStepSummary> & { stepId: number }): TeachingStepSummary {
  return {
    label: `Step ${overrides.stepId + 1}`,
    narration: "",
    misconceptionLabel: null,
    ...overrides,
  };
}

function makeSnapshot(steps: TeachingStepSummary[], overrides: Partial<WhiteboardLessonSnapshot> = {}): WhiteboardLessonSnapshot {
  return {
    lessonId: "lesson-1",
    documentId: "doc-a",
    pageNumber: 12,
    pageTruthKey: "doc-a::12::t",
    conceptIds: [],
    thoughtUnitIds: [],
    visualGrammar: "mechanism",
    professorPlanVersion: 1,
    sceneGraphVersion: "vsg-hash",
    teachingSteps: steps,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const OPTS = { bookId: "book-1", pageNumber: 12 };

describe("buildNotebookSceneFromLessonSnapshot — empty/skipped steps", () => {
  it("a step that drew and said nothing contributes no blocks at all", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([makeStep({ stepId: 0 })]), OPTS);
    expect(scene.blocks).toEqual([]);
  });

  it("a step with only narration still produces a heading + text block", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(
      makeSnapshot([makeStep({ stepId: 0, narration: "This explains the mechanism." })]),
      OPTS,
    );
    const primitives = scene.blocks.map((b) => b.primitive);
    expect(primitives).toContain("heading");
    expect(primitives).toContain("text");
    expect(scene.blocks.find((b) => b.primitive === "text")!.content).toBe("This explains the mechanism.");
  });
});

describe("buildNotebookSceneFromLessonSnapshot — shape kind mapping", () => {
  it("box -> diagram, circle -> label, diamond/hexagon/cloud -> callout, brace/line -> connector", () => {
    const step = makeStep({
      stepId: 0,
      shapes: [
        { shapeId: "s1", kind: "box", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s2", kind: "circle", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s3", kind: "diamond", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s4", kind: "hexagon", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s5", kind: "cloud", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s6", kind: "brace", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s7", kind: "line", bounds: { x: 0, y: 0, w: 10, h: 10 } },
      ],
    });
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([step]), OPTS);
    const primitiveByShapeOrder = scene.blocks.filter((b) => b.primitive !== "heading").map((b) => b.primitive);
    expect(primitiveByShapeOrder).toEqual(["diagram", "label", "callout", "callout", "callout", "connector", "connector"]);
  });

  it("never emits a grounding-required primitive (highlight/underline/source_anchor) — lesson content is Professor's own composed teaching, not a verbatim source quote", () => {
    const step = makeStep({
      stepId: 0,
      narration: "narration text",
      misconceptionLabel: "a misconception",
      shapes: [{ shapeId: "s1", kind: "box", bounds: { x: 0, y: 0, w: 10, h: 10 } }],
      labels: [{ shapeId: "l1", text: "a label", x: 0, y: 0 }],
      arrows: [{ shapeId: "a1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }],
    });
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([step]), OPTS);
    for (const block of scene.blocks) {
      expect(GROUNDING_REQUIRED_PRIMITIVES.has(block.primitive)).toBe(false);
    }
  });
});

describe("buildNotebookSceneFromLessonSnapshot — shape/label matching via targetId", () => {
  it("a shape and its matching label (same targetId) become ONE block carrying the label's real text", () => {
    const step = makeStep({
      stepId: 0,
      shapes: [{ shapeId: "s1", targetId: "node-1", kind: "box", bounds: { x: 0, y: 0, w: 10, h: 10 } }],
      labels: [{ shapeId: "l1", targetId: "node-1", text: "Sodium channel", x: 0, y: 0 }],
    });
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([step]), OPTS);
    const diagramBlocks = scene.blocks.filter((b) => b.primitive === "diagram");
    const labelBlocks = scene.blocks.filter((b) => b.primitive === "label");
    expect(diagramBlocks).toHaveLength(1);
    expect(diagramBlocks[0].content).toBe("Sodium channel");
    expect(labelBlocks).toHaveLength(0); // never a redundant standalone label for the same text
  });

  it("a label with no matching shape (a caption drawn on its own) still becomes its own label block", () => {
    const step = makeStep({
      stepId: 0,
      labels: [{ shapeId: "l1", text: "a standalone caption", x: 0, y: 0 }],
    });
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([step]), OPTS);
    expect(scene.blocks.some((b) => b.primitive === "label" && b.content === "a standalone caption")).toBe(true);
  });
});

describe("buildNotebookSceneFromLessonSnapshot — arrow relationship mapping", () => {
  it("causes/leads-to/warns-about map to arrow; supports/contrasts/part-of map to connector", () => {
    const step = makeStep({
      stepId: 0,
      arrows: [
        { shapeId: "a1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relationshipKind: "causes" },
        { shapeId: "a2", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relationshipKind: "leads-to" },
        { shapeId: "a3", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relationshipKind: "warns-about" },
        { shapeId: "a4", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relationshipKind: "supports" },
        { shapeId: "a5", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relationshipKind: "contrasts" },
        { shapeId: "a6", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relationshipKind: "part-of" },
      ],
    });
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([step]), OPTS);
    const primitives = scene.blocks.filter((b) => b.primitive !== "heading").map((b) => b.primitive);
    expect(primitives).toEqual(["arrow", "arrow", "arrow", "connector", "connector", "connector"]);
  });

  it("an arrow with no relationshipKind defaults to connector with generic content", () => {
    const step = makeStep({ stepId: 0, arrows: [{ shapeId: "a1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }] });
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([step]), OPTS);
    const arrowBlock = scene.blocks.find((b) => b.primitive === "connector")!;
    expect(arrowBlock.content).toBe("connects to");
  });

  it("REQUIRED: an arrow targeting a specific shape resolves (via notebookLayout's connector resolution) to point at exactly that shape, not an arbitrary neighbor", () => {
    const step = makeStep({
      stepId: 0,
      shapes: [
        { shapeId: "s1", targetId: "node-a", kind: "box", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s2", targetId: "node-b", kind: "box", bounds: { x: 0, y: 0, w: 10, h: 10 } },
        { shapeId: "s3", targetId: "node-c", kind: "box", bounds: { x: 0, y: 0, w: 10, h: 10 } },
      ],
      arrows: [{ shapeId: "arrow1", targetId: "node-b", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relationshipKind: "causes" }],
    });
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([step]), OPTS);
    const layout = layoutNotebookScene(scene);
    expect(layout.connections).toHaveLength(1);
    // node-b is the 2nd shape drawn (s2); its own block is the 2nd "diagram" block emitted.
    const shapeBlocks = scene.blocks.filter((b) => b.primitive === "diagram");
    expect(layout.connections[0].toBlockId).toBe(shapeBlocks[1].id);
    expect(layout.connections[0].fromBlockId).toBe(shapeBlocks[0].id);
  });
});

describe("buildNotebookSceneFromLessonSnapshot — misconception", () => {
  it("a step's misconceptionLabel becomes a callout block", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(
      makeSnapshot([makeStep({ stepId: 0, narration: "x", misconceptionLabel: "X does not directly cause Y" })]),
      OPTS,
    );
    const callout = scene.blocks.find((b) => b.primitive === "callout");
    expect(callout?.content).toBe("X does not directly cause Y");
  });
});

describe("buildNotebookSceneFromLessonSnapshot — grouping and provenance", () => {
  it("every block from the same step shares one groupId, distinct from other steps' groupId", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(
      makeSnapshot([
        makeStep({ stepId: 0, narration: "step 0 text" }),
        makeStep({ stepId: 1, narration: "step 1 text" }),
      ]),
      OPTS,
    );
    const groupIds = new Set(scene.blocks.map((b) => b.groupId));
    expect(groupIds.size).toBe(2);
    expect(scene.blocks.filter((b) => b.content === "step 0 text")[0].groupId).toBe("lesson-step-0");
    expect(scene.blocks.filter((b) => b.content === "step 1 text")[0].groupId).toBe("lesson-step-1");
  });

  it("REQUIRED: every block is generatedFrom 'derived' (never 'ai') with canonicalUnitId always null and no invented per-block source", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(
      makeSnapshot([makeStep({ stepId: 0, narration: "x" })]),
      OPTS,
    );
    for (const block of scene.blocks) {
      expect(block.generatedFrom).toBe("derived");
      expect(block.canonicalUnitId).toBeNull();
      expect(block.sourceId).toBe("doc-a");
      expect(block.confidence).toBeGreaterThan(0);
      expect(block.confidence).toBeLessThan(1); // never claims verified-verbatim (1) for non-grounded content
    }
  });

  it("page prefers the snapshot's own pageNumber over opts.pageNumber", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(
      makeSnapshot([makeStep({ stepId: 0, narration: "x" })], { pageNumber: 99 }),
      { bookId: "book-1", pageNumber: 12 },
    );
    expect(scene.blocks[0].page).toBe(99);
  });

  it("falls back to opts.pageNumber when the snapshot has none", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(
      makeSnapshot([makeStep({ stepId: 0, narration: "x" })], { pageNumber: null }),
      { bookId: "book-1", pageNumber: 12 },
    );
    expect(scene.blocks[0].page).toBe(12);
  });

  it("teachingStructure is always null — never guessed from visualGrammar", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([makeStep({ stepId: 0, narration: "x" })]), OPTS);
    expect(scene.teachingStructure).toBeNull();
  });

  it("scene id/bookId/pageNumber match the caller's opts", () => {
    const scene = buildNotebookSceneFromLessonSnapshot(makeSnapshot([makeStep({ stepId: 0, narration: "x" })]), OPTS);
    expect(scene.bookId).toBe("book-1");
    expect(scene.pageNumber).toBe(12);
  });
});

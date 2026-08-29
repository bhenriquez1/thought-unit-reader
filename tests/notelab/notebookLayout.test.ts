// tests/notelab/notebookLayout.test.ts
// N3 — real behavioral tests for lib/notelab/notebookLayout.ts, the pure
// VisualNotebookScene -> pixel-position layout algorithm. No DOM/React
// dependency (this file is deliberately pure), so these are full behavioral
// tests, not source-inspection — same discipline as
// tests/notelab/notebookPlanner.test.ts for N2's own pure functions.
//
// What this guards, concretely: the correction's "authored, not gridded"
// requirement — different primitive mixes must produce genuinely different
// layouts (not one uniform card grid regardless of content) — plus the
// arrow/connector resolution convention N3 established (nearest preceding/
// following non-connector sibling by `order`, dropped if either is missing).

import {
  CANVAS_WIDTH,
  layoutNotebookScene,
} from "../../lib/notelab/notebookLayout";
import type { FinalizedNotebookBlock, VisualNotebookScene, NotebookPrimitive } from "../../lib/notelab/notebookScene";

function makeBlock(overrides: Partial<FinalizedNotebookBlock> & { id: string; primitive: NotebookPrimitive; order: number }): FinalizedNotebookBlock {
  return {
    content: "content",
    detail: null,
    groupId: null,
    sourceUnitIndex: 0,
    canonicalUnitId: "unit-1",
    sourceId: "doc-1",
    page: 3,
    confidence: 0.6,
    generatedFrom: "ai",
    ...overrides,
  };
}

function makeScene(blocks: FinalizedNotebookBlock[]): VisualNotebookScene {
  return {
    id: "scene-1",
    bookId: "book-1",
    pageNumber: 3,
    teachingStructure: null,
    blocks,
    builtAt: Date.now(),
  };
}

describe("layoutNotebookScene — empty and single-block scenes", () => {
  it("an empty scene lays out to zero blocks/connections and zero canvas height", () => {
    const result = layoutNotebookScene(makeScene([]));
    expect(result.blocks).toEqual([]);
    expect(result.connections).toEqual([]);
    expect(result.canvasWidth).toBe(CANVAS_WIDTH);
    expect(result.canvasHeight).toBe(0);
  });

  it("a single ungrouped block is positioned at the origin with its primitive's own dimensions", () => {
    const result = layoutNotebookScene(makeScene([makeBlock({ id: "b1", primitive: "heading", order: 0 })]));
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ id: "b1", x: 0, y: 0 });
    expect(result.blocks[0].w).toBeGreaterThan(0);
    expect(result.blocks[0].h).toBeGreaterThan(0);
  });

  it("a lone connector block with no group produces no positioned block and no connection — never drawn pointing at nothing", () => {
    const result = layoutNotebookScene(makeScene([makeBlock({ id: "b1", primitive: "arrow", order: 0 })]));
    expect(result.blocks).toEqual([]);
    expect(result.connections).toEqual([]);
  });
});

describe("layoutNotebookScene — different primitive mixes produce genuinely different layouts", () => {
  it("anchor primitives (diagram/concept_map/image) claim the full canvas width; text primitives do not", () => {
    const diagramResult = layoutNotebookScene(makeScene([makeBlock({ id: "d1", primitive: "diagram", order: 0 })]));
    const textResult = layoutNotebookScene(makeScene([makeBlock({ id: "t1", primitive: "text", order: 0 })]));
    expect(diagramResult.blocks[0].w).toBe(CANVAS_WIDTH);
    expect(textResult.blocks[0].w).toBeLessThan(CANVAS_WIDTH);
  });

  it("two scenes with different primitive compositions produce different block dimension sets — never one uniform grid", () => {
    const chemistryScene = makeScene([
      makeBlock({ id: "c1", primitive: "formula", order: 0 }),
      makeBlock({ id: "c2", primitive: "equation_work", order: 1 }),
    ]);
    const historyScene = makeScene([
      makeBlock({ id: "h1", primitive: "timeline", order: 0, groupId: "g1" }),
      makeBlock({ id: "h2", primitive: "timeline", order: 1, groupId: "g1" }),
    ]);
    const chemistryLayout = layoutNotebookScene(chemistryScene);
    const historyLayout = layoutNotebookScene(historyScene);
    const chemistryDims = chemistryLayout.blocks.map((b) => `${b.w}x${b.h}`).sort();
    const historyDims = historyLayout.blocks.map((b) => `${b.w}x${b.h}`).sort();
    expect(chemistryDims).not.toEqual(historyDims);
  });
});

describe("layoutNotebookScene — grouping composition", () => {
  it("an anchor group (diagram + label children) positions the anchor first, then flows children beneath it", () => {
    const scene = makeScene([
      makeBlock({ id: "diagram", primitive: "diagram", order: 0, groupId: "g1" }),
      makeBlock({ id: "label1", primitive: "label", order: 1, groupId: "g1" }),
      makeBlock({ id: "label2", primitive: "label", order: 2, groupId: "g1" }),
    ]);
    const result = layoutNotebookScene(scene);
    const diagram = result.blocks.find((b) => b.id === "diagram")!;
    const label1 = result.blocks.find((b) => b.id === "label1")!;
    expect(diagram.y).toBe(0);
    expect(label1.y).toBeGreaterThan(diagram.y + diagram.h - 1); // beneath the anchor, not overlapping
  });

  it("a chain group (timeline/flow) lays out its blocks left to right in equal-width steps", () => {
    const scene = makeScene([
      makeBlock({ id: "t1", primitive: "timeline", order: 0, groupId: "g1" }),
      makeBlock({ id: "t2", primitive: "timeline", order: 1, groupId: "g1" }),
      makeBlock({ id: "t3", primitive: "timeline", order: 2, groupId: "g1" }),
    ]);
    const result = layoutNotebookScene(scene);
    const [b1, b2, b3] = ["t1", "t2", "t3"].map((id) => result.blocks.find((b) => b.id === id)!);
    expect(b1.y).toBe(b2.y);
    expect(b2.y).toBe(b3.y);
    expect(b1.w).toBe(b2.w);
    expect(b2.x).toBeGreaterThan(b1.x);
    expect(b3.x).toBeGreaterThan(b2.x);
  });

  it("a comparison group splits into side-by-side columns of equal width", () => {
    const scene = makeScene([
      makeBlock({ id: "cmp1", primitive: "comparison", order: 0, groupId: "g1" }),
      makeBlock({ id: "cmp2", primitive: "text", order: 1, groupId: "g1" }),
    ]);
    const result = layoutNotebookScene(scene);
    const [b1, b2] = ["cmp1", "cmp2"].map((id) => result.blocks.find((b) => b.id === id)!);
    expect(b1.y).toBe(b2.y);
    expect(b1.w).toBe(b2.w);
    expect(b1.x).toBe(0);
    expect(b2.x).toBeGreaterThan(b1.x);
  });

  it("a plain stack group indents each successive block, capped at 96px", () => {
    const scene = makeScene([
      makeBlock({ id: "s1", primitive: "text", order: 0, groupId: "g1" }),
      makeBlock({ id: "s2", primitive: "callout", order: 1, groupId: "g1" }),
      makeBlock({ id: "s3", primitive: "example", order: 2, groupId: "g1" }),
      makeBlock({ id: "s4", primitive: "example", order: 3, groupId: "g1" }),
      makeBlock({ id: "s5", primitive: "example", order: 4, groupId: "g1" }),
    ]);
    const result = layoutNotebookScene(scene);
    const byId = new Map(result.blocks.map((b) => [b.id, b]));
    expect(byId.get("s1")!.x).toBe(0);
    expect(byId.get("s2")!.x).toBe(24);
    expect(byId.get("s5")!.x).toBeLessThanOrEqual(96);
    // Each block stacks strictly below the previous one — never overlapping vertically.
    expect(byId.get("s2")!.y).toBeGreaterThan(byId.get("s1")!.y);
    expect(byId.get("s3")!.y).toBeGreaterThan(byId.get("s2")!.y);
  });

  it("rows order by the minimum `order` among each group's own blocks, not Map insertion order", () => {
    const scene = makeScene([
      makeBlock({ id: "late", primitive: "text", order: 10, groupId: "gLate" }),
      makeBlock({ id: "early", primitive: "text", order: 1, groupId: "gEarly" }),
    ]);
    const result = layoutNotebookScene(scene);
    const early = result.blocks.find((b) => b.id === "early")!;
    const late = result.blocks.find((b) => b.id === "late")!;
    expect(early.y).toBeLessThan(late.y);
  });
});

describe("layoutNotebookScene — connector resolution", () => {
  it("an arrow within a group connects the nearest preceding and following non-connector siblings by order", () => {
    const scene = makeScene([
      makeBlock({ id: "from", primitive: "text", order: 0, groupId: "g1" }),
      makeBlock({ id: "arrow1", primitive: "arrow", order: 1, groupId: "g1" }),
      makeBlock({ id: "to", primitive: "text", order: 2, groupId: "g1" }),
    ]);
    const result = layoutNotebookScene(scene);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]).toMatchObject({ blockId: "arrow1", fromBlockId: "from", toBlockId: "to", primitive: "arrow" });
  });

  it("a connector missing a neighbor on either side is silently dropped, never drawn pointing at nothing", () => {
    const scene = makeScene([
      makeBlock({ id: "only", primitive: "text", order: 0, groupId: "g1" }),
      makeBlock({ id: "orphan-connector", primitive: "connector", order: 1, groupId: "g1" }),
    ]);
    const result = layoutNotebookScene(scene);
    expect(result.connections).toEqual([]);
  });

  it("connector/arrow blocks never appear in the positioned blocks output themselves", () => {
    const scene = makeScene([
      makeBlock({ id: "from", primitive: "text", order: 0, groupId: "g1" }),
      makeBlock({ id: "arrow1", primitive: "arrow", order: 1, groupId: "g1" }),
      makeBlock({ id: "to", primitive: "text", order: 2, groupId: "g1" }),
    ]);
    const result = layoutNotebookScene(scene);
    expect(result.blocks.some((b) => b.id === "arrow1")).toBe(false);
  });
});

describe("layoutNotebookScene — determinism and canvas sizing", () => {
  it("the same scene always produces the same layout (pure, no randomness/Date dependence)", () => {
    const scene = makeScene([
      makeBlock({ id: "a", primitive: "diagram", order: 0, groupId: "g1" }),
      makeBlock({ id: "b", primitive: "label", order: 1, groupId: "g1" }),
      makeBlock({ id: "c", primitive: "text", order: 2 }),
    ]);
    const first = layoutNotebookScene(scene);
    const second = layoutNotebookScene(scene);
    expect(first).toEqual(second);
  });

  it("canvasHeight tracks the deepest positioned block's bottom edge", () => {
    const scene = makeScene([
      makeBlock({ id: "a", primitive: "text", order: 0 }),
      makeBlock({ id: "b", primitive: "text", order: 1 }),
    ]);
    const result = layoutNotebookScene(scene);
    const maxBottom = Math.max(...result.blocks.map((b) => b.y + b.h));
    expect(result.canvasHeight).toBe(maxBottom);
  });
});

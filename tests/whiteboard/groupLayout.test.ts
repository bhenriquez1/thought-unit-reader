// tests/whiteboard/groupLayout.test.ts
import { computeGroupLayout, anchorPoint } from "../../lib/whiteboard/groupLayout";
import type { GroupLayoutNodeInput, GroupLayoutGroupInput } from "../../lib/whiteboard/groupLayout";

function node(id: string, label = `Label ${id}`): GroupLayoutNodeInput {
  return { id, label };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + b.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("computeGroupLayout — every node gets sized from its own real label", () => {
  it("a node with a longer label gets a wider box than one with a short label", () => {
    const nodes = [node("n1", "X"), node("n2", "A considerably longer descriptive phrase here")];
    const groups: GroupLayoutGroupInput[] = [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    expect(nodeBounds.get("n2")!.w).toBeGreaterThan(nodeBounds.get("n1")!.w);
  });

  it("a node not referenced by any group is simply absent from nodeBounds", () => {
    const nodes = [node("n1"), node("orphan")];
    const groups: GroupLayoutGroupInput[] = [{ id: "g1", type: "core", order: 1, nodeIds: ["n1"] }];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    expect(nodeBounds.has("n1")).toBe(true);
    expect(nodeBounds.has("orphan")).toBe(false);
  });
});

describe("computeGroupLayout — regions are placed in group.order sequence, never overlapping", () => {
  it("a later-order group's region starts below an earlier-order group's region", () => {
    const nodes = [node("n1"), node("n2")];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
      { id: "g2", type: "sequence", order: 2, nodeIds: ["n2"] },
    ];
    const { groupBounds } = computeGroupLayout(nodes, groups);
    const g1 = groupBounds.get("g1")!;
    const g2 = groupBounds.get("g2")!;
    expect(g2.y).toBeGreaterThanOrEqual(g1.y + g1.h);
  });

  it("region placement order follows group.order, not the groups[] array order", () => {
    const nodes = [node("n1"), node("n2")];
    const groups: GroupLayoutGroupInput[] = [
      { id: "second", type: "sequence", order: 2, nodeIds: ["n2"] },
      { id: "first", type: "core", order: 1, nodeIds: ["n1"] },
    ];
    const { groupBounds } = computeGroupLayout(nodes, groups);
    expect(groupBounds.get("first")!.y).toBeLessThan(groupBounds.get("second")!.y);
  });

  it("no two nodes across the whole layout overlap — the direct fix for 'shapes overlap'", () => {
    const nodes = Array.from({ length: 8 }, (_, i) => node(`n${i}`, `Node label number ${i} with some extra words`));
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["n0"] },
      { id: "g2", type: "mechanism", order: 2, nodeIds: ["n1", "n2"] },
      { id: "g3", type: "sequence", order: 3, nodeIds: ["n3", "n4", "n5"] },
      { id: "g4", type: "warning", order: 4, nodeIds: ["n6"] },
      { id: "g5", type: "summary", order: 5, nodeIds: ["n7"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const boxes = Array.from(nodeBounds.values());
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });
});

describe("computeGroupLayout — comparison groups split into two columns", () => {
  it("comparison-group nodes land in (at least) two distinct x positions", () => {
    const nodes = [node("a1"), node("a2"), node("b1"), node("b2")];
    const groups: GroupLayoutGroupInput[] = [
      { id: "cmp", type: "comparison", order: 1, nodeIds: ["a1", "a2", "b1", "b2"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const xs = new Set(Array.from(nodeBounds.values()).map(b => b.x));
    expect(xs.size).toBeGreaterThanOrEqual(2);
  });
});

describe("computeGroupLayout — a warning group reads as set apart from the main flow", () => {
  it("a warning group's nodes sit at a distinct x from the group immediately before it, not stacked below it", () => {
    const nodes = [node("core1"), node("warn1")];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["core1"] },
      { id: "g2", type: "warning", order: 2, nodeIds: ["warn1"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    expect(nodeBounds.get("warn1")!.x).toBeGreaterThan(nodeBounds.get("core1")!.x);
  });
});

describe("computeGroupLayout — canvas extent covers every placed node", () => {
  it("canvas width/height are large enough to contain every node's bounds", () => {
    const nodes = [node("n1", "A reasonably long label for this node"), node("n2")];
    const groups: GroupLayoutGroupInput[] = [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }];
    const { nodeBounds, canvas } = computeGroupLayout(nodes, groups);
    for (const box of nodeBounds.values()) {
      expect(box.x + box.w).toBeLessThanOrEqual(canvas.width);
      expect(box.y + box.h).toBeLessThanOrEqual(canvas.height);
    }
  });
});

describe("computeGroupLayout — deterministic", () => {
  it("the same nodes/groups input always produces an equal result", () => {
    const nodes = [node("n1"), node("n2"), node("n3")];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
      { id: "g2", type: "sequence", order: 2, nodeIds: ["n2", "n3"] },
    ];
    const a = computeGroupLayout(nodes, groups);
    const b = computeGroupLayout(nodes, groups);
    expect(Array.from(a.nodeBounds.entries())).toEqual(Array.from(b.nodeBounds.entries()));
    expect(a.canvas).toEqual(b.canvas);
  });
});

describe("anchorPoint — routes from whichever edge actually faces the other shape", () => {
  const box = { x: 100, y: 100, w: 200, h: 100 }; // center (200, 150)

  it("a target directly to the right anchors on the box's right edge, vertically centered", () => {
    const p = anchorPoint(box, 1000, 150);
    expect(p.x).toBeCloseTo(300, 0); // box.x + box.w
    expect(p.y).toBeCloseTo(150, 0);
  });

  it("a target directly below anchors on the box's bottom edge, horizontally centered", () => {
    const p = anchorPoint(box, 200, 1000);
    expect(p.y).toBeCloseTo(200, 0); // box.y + box.h
    expect(p.x).toBeCloseTo(200, 0);
  });

  it("a target directly to the left anchors on the box's left edge", () => {
    const p = anchorPoint(box, -1000, 150);
    expect(p.x).toBeCloseTo(100, 0);
  });

  it("a target directly above anchors on the box's top edge", () => {
    const p = anchorPoint(box, 200, -1000);
    expect(p.y).toBeCloseTo(100, 0);
  });

  it("the returned point always lies on the box's border, never inside it", () => {
    const p = anchorPoint(box, 500, 400);
    const onVerticalEdge = p.x === box.x || p.x === box.x + box.w;
    const onHorizontalEdge = p.y === box.y || p.y === box.y + box.h;
    expect(onVerticalEdge || onHorizontalEdge).toBe(true);
  });
});

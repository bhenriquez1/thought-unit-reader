// tests/whiteboard/groupLayout.test.ts
import { computeGroupLayout, anchorPoint, lineIntersectsBox, computeAvoidanceBend } from "../../lib/whiteboard/groupLayout";
import type { GroupLayoutNodeInput, GroupLayoutGroupInput } from "../../lib/whiteboard/groupLayout";
import type { SpatialIntent } from "../../lib/whiteboard/professorLessonPlan";

function node(id: string, label = `Label ${id}`, spatialIntent?: SpatialIntent): GroupLayoutNodeInput {
  return { id, label, spatialIntent };
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

describe("computeGroupLayout — Phase B2: comparison-column nodes split into two columns", () => {
  it("comparison-column nodes land in (at least) two distinct x positions", () => {
    const nodes = [
      node("a1", "Label a1", "comparison-column"), node("a2", "Label a2", "comparison-column"),
      node("b1", "Label b1", "comparison-column"), node("b2", "Label b2", "comparison-column"),
    ];
    const groups: GroupLayoutGroupInput[] = [
      { id: "cmp", type: "comparison", order: 1, nodeIds: ["a1", "a2", "b1", "b2"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const xs = new Set(Array.from(nodeBounds.values()).map(b => b.x));
    expect(xs.size).toBeGreaterThanOrEqual(2);
  });

  it("REQUIRED: corresponding comparison pairs (colA[i] vs colB[i]) share the same row y, even when their labels wrap to different heights", () => {
    const nodes = [
      node("a1", "Short", "comparison-column"),
      node("a2", "A considerably longer descriptive phrase that wraps to more lines", "comparison-column"),
      node("b1", "Also short", "comparison-column"),
      node("b2", "Brief", "comparison-column"),
    ];
    const groups: GroupLayoutGroupInput[] = [{ id: "cmp", type: "comparison", order: 1, nodeIds: ["a1", "a2", "b1", "b2"] }];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    expect(nodeBounds.get("a1")!.y).toBe(nodeBounds.get("b1")!.y);
    expect(nodeBounds.get("a2")!.y).toBe(nodeBounds.get("b2")!.y);
    // a2's row is taller than a1's — b2 (the shorter item) still starts the
    // NEXT row at the SAME y as a2, i.e. its row height was widened to match.
    expect(nodeBounds.get("a2")!.y).toBeGreaterThan(nodeBounds.get("a1")!.y);
  });

  it("a single surviving comparison-column node is a plain single column, not a degenerate split", () => {
    const nodes = [node("a1", "Label a1", "comparison-column")];
    const groups: GroupLayoutGroupInput[] = [{ id: "cmp", type: "comparison", order: 1, nodeIds: ["a1"] }];
    expect(() => computeGroupLayout(nodes, groups)).not.toThrow();
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    expect(nodeBounds.has("a1")).toBe(true);
  });
});

describe("computeGroupLayout — Phase B2: warning-aside nodes read as set apart from the main flow", () => {
  it("a warning-aside node sits well below the central-mechanism region, with extra separation", () => {
    const nodes = [node("core1", "Label core1", "central-mechanism"), node("warn1", "Label warn1", "warning-aside")];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["core1"] },
      { id: "g2", type: "warning", order: 2, nodeIds: ["warn1"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const core = nodeBounds.get("core1")!;
    const warn = nodeBounds.get("warn1")!;
    expect(warn.y).toBeGreaterThan(core.y + core.h);
  });
});

describe("computeGroupLayout — Phase B2: left/right branches flank the central-mechanism column", () => {
  it("REQUIRED: left-branch and right-branch nodes land at distinct x positions on either side of a central-mechanism node, top-aligned with it (not stacked below)", () => {
    const nodes = [
      node("center1", "Central idea", "central-mechanism"),
      node("left1", "Left branch", "left-branch"),
      node("right1", "Right branch", "right-branch"),
    ];
    const groups: GroupLayoutGroupInput[] = [{ id: "g1", type: "core", order: 1, nodeIds: ["center1", "left1", "right1"] }];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const center = nodeBounds.get("center1")!;
    const left = nodeBounds.get("left1")!;
    const right = nodeBounds.get("right1")!;
    expect(left.x + left.w).toBeLessThanOrEqual(center.x);
    expect(right.x).toBeGreaterThanOrEqual(center.x + center.w);
    expect(left.y).toBe(center.y);
    expect(right.y).toBe(center.y);
  });

  it("branch layouts do not degenerate into a single tall vertical strip — left/right/center produce at least 3 distinct x positions", () => {
    const nodes = [
      node("c1", "Center one", "central-mechanism"), node("c2", "Center two", "central-mechanism"),
      node("l1", "Left one", "left-branch"), node("l2", "Left two", "left-branch"),
      node("r1", "Right one", "right-branch"), node("r2", "Right two", "right-branch"),
    ];
    const groups: GroupLayoutGroupInput[] = [{ id: "g1", type: "core", order: 1, nodeIds: ["c1", "c2", "l1", "l2", "r1", "r2"] }];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const xs = new Set(Array.from(nodeBounds.values()).map(b => b.x));
    expect(xs.size).toBeGreaterThanOrEqual(3);
  });
});

describe("computeGroupLayout — Phase B2: final-summary always lands last, regardless of narrative group.order", () => {
  it("REQUIRED: a final-summary node sits below every other region even when its group.order is NOT the highest", () => {
    const nodes = [
      node("summary1", "The takeaway", "final-summary"),
      node("core1", "Core idea", "central-mechanism"),
      node("warn1", "A trap", "warning-aside"),
    ];
    // Deliberately give the summary group.order 1 (first) — final-summary
    // must still be placed LAST spatially.
    const groups: GroupLayoutGroupInput[] = [
      { id: "gS", type: "summary", order: 1, nodeIds: ["summary1"] },
      { id: "gC", type: "core", order: 2, nodeIds: ["core1"] },
      { id: "gW", type: "warning", order: 3, nodeIds: ["warn1"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const summary = nodeBounds.get("summary1")!;
    const core = nodeBounds.get("core1")!;
    const warn = nodeBounds.get("warn1")!;
    expect(summary.y).toBeGreaterThan(core.y);
    expect(summary.y).toBeGreaterThanOrEqual(warn.y);
  });
});

describe("computeGroupLayout — Phase B2: a page with only central-mechanism nodes collapses to the simple single-column case", () => {
  it("the smallest visual grammar falls out for free — no branch/comparison/warning regions means one plain column", () => {
    const nodes = [node("n1", "First", "central-mechanism"), node("n2", "Second", "central-mechanism")];
    const groups: GroupLayoutGroupInput[] = [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const n1 = nodeBounds.get("n1")!;
    const n2 = nodeBounds.get("n2")!;
    expect(n1.x).toBe(n2.x); // same column
    expect(n2.y).toBeGreaterThan(n1.y); // stacked, not side by side
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

describe("Phase B2: lineIntersectsBox — straight-line vs obstacle detection", () => {
  const box = { x: 100, y: 100, w: 100, h: 100 }; // spans (100,100)-(200,200)

  it("REQUIRED: a line straight through the box's middle intersects", () => {
    expect(lineIntersectsBox({ x: 50, y: 150 }, { x: 250, y: 150 }, box)).toBe(true);
  });

  it("a line that passes well above the box does not intersect", () => {
    expect(lineIntersectsBox({ x: 50, y: 20 }, { x: 250, y: 20 }, box)).toBe(false);
  });

  it("a line ending inside the box counts as intersecting", () => {
    expect(lineIntersectsBox({ x: 50, y: 150 }, { x: 150, y: 150 }, box)).toBe(true);
  });
});

describe("Phase B2: computeAvoidanceBend — connectors curve around a third node's box", () => {
  it("REQUIRED: returns 0 (straight line) when no obstacle sits between from and to", () => {
    const bend = computeAvoidanceBend({ x: 0, y: 0 }, { x: 300, y: 0 }, [{ x: 0, y: 200, w: 50, h: 50 }]);
    expect(bend).toBe(0);
  });

  it("REQUIRED: returns a nonzero bend when a third node's box sits directly on the straight line", () => {
    const obstacle = { x: 130, y: 90, w: 40, h: 20 }; // straddles the line y=100 at x~130-170
    const bend = computeAvoidanceBend({ x: 0, y: 100 }, { x: 300, y: 100 }, [obstacle]);
    expect(bend).not.toBe(0);
  });

  it("the curved arc's approximate midpoint (straight-line midpoint offset perpendicular by `bend`) clears the obstacle it was routed around", () => {
    const from = { x: 0, y: 100 };
    const to = { x: 300, y: 100 };
    const obstacle = { x: 130, y: 90, w: 40, h: 20 };
    const bend = computeAvoidanceBend(from, to, [obstacle]);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const perp = { x: -dy / len, y: dx / len };
    const arcMid = { x: midX + perp.x * bend, y: midY + perp.y * bend };
    const clearsObstacle = arcMid.x < obstacle.x || arcMid.x > obstacle.x + obstacle.w
      || arcMid.y < obstacle.y || arcMid.y > obstacle.y + obstacle.h;
    expect(clearsObstacle).toBe(true);
  });

  it("ignores obstacles the line doesn't actually reach — a box off to the side never triggers a bend", () => {
    const bend = computeAvoidanceBend({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 500, y: 500, w: 50, h: 50 }]);
    expect(bend).toBe(0);
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

// Correction (Whiteboard density) — a row below Row 1 (comparison/warning/
// summary) used to always start at x=CANVAS_MARGIN regardless of how wide
// Row 1 made the board, leaving real blank canvas to its right whenever a
// later row was narrower — real wasted space INSIDE the camera-framed
// bounding box Row 1 already established, not reserved ahead of time.
describe("computeGroupLayout — Phase B2/density fix: narrower later rows are centered within Row 1's own width, not left-anchored", () => {
  it("REQUIRED: a single warning-aside node under a wide 3-column Row 1 is horizontally centered under it, not stuck at the left margin", () => {
    const nodes = [
      node("left1", "Left branch", "left-branch"),
      node("center1", "Central idea", "central-mechanism"),
      node("right1", "Right branch", "right-branch"),
      node("warn1", "A brief warning", "warning-aside"),
    ];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["left1", "center1", "right1"] },
      { id: "g2", type: "warning", order: 2, nodeIds: ["warn1"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const row1Right = Math.max(
      nodeBounds.get("left1")!.x + nodeBounds.get("left1")!.w,
      nodeBounds.get("center1")!.x + nodeBounds.get("center1")!.w,
      nodeBounds.get("right1")!.x + nodeBounds.get("right1")!.w,
    );
    const warn = nodeBounds.get("warn1")!;
    // Centered means real space on BOTH sides — not flush against the left
    // margin (the old bug) and not flush against Row 1's own right edge.
    expect(warn.x).toBeGreaterThan(40); // > CANVAS_MARGIN
    expect(warn.x + warn.w).toBeLessThan(row1Right);
  });

  it("REQUIRED: a single final-summary node under a wide Row 1 is likewise centered, not left-anchored", () => {
    const nodes = [
      node("left1", "Left branch", "left-branch"),
      node("center1", "Central idea", "central-mechanism"),
      node("right1", "Right branch", "right-branch"),
      node("sum1", "In summary", "final-summary"),
    ];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["left1", "center1", "right1"] },
      { id: "g2", type: "summary", order: 2, nodeIds: ["sum1"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const sum = nodeBounds.get("sum1")!;
    expect(sum.x).toBeGreaterThan(40);
  });

  it("a later row WIDER than Row 1 is left alone — centering never shrinks or clips a row, only repositions a genuinely narrower one", () => {
    const nodes = [
      node("center1", "X", "central-mechanism"),
      node("cmpA", "A considerably longer descriptive phrase than the tiny center node above", "comparison-column"),
      node("cmpB", "Another fairly long descriptive phrase for the second column", "comparison-column"),
    ];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["center1"] },
      { id: "g2", type: "comparison", order: 2, nodeIds: ["cmpA", "cmpB"] },
    ];
    const { nodeBounds } = computeGroupLayout(nodes, groups);
    const cmpA = nodeBounds.get("cmpA")!;
    // Still left-anchored at CANVAS_MARGIN since this row is the widest thing on the board.
    expect(cmpA.x).toBe(40);
  });

  it("no two nodes overlap once later rows are recentered — the collision backstop still holds", () => {
    const nodes = [
      node("left1", "Left branch", "left-branch"),
      node("center1", "Central idea", "central-mechanism"),
      node("right1", "Right branch", "right-branch"),
      node("warn1", "A brief warning", "warning-aside"),
      node("sum1", "In summary", "final-summary"),
    ];
    const groups: GroupLayoutGroupInput[] = [
      { id: "g1", type: "core", order: 1, nodeIds: ["left1", "center1", "right1"] },
      { id: "g2", type: "warning", order: 2, nodeIds: ["warn1"] },
      { id: "g3", type: "summary", order: 3, nodeIds: ["sum1"] },
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

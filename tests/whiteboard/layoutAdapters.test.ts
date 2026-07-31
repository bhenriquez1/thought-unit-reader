// tests/whiteboard/layoutAdapters.test.ts
// Tests for lib/whiteboard/layoutAdapters.ts

import {
  flowLayout,
  timelineLayout,
  hubSpokeLayout,
  comparisonLayout,
  equationLayout,
  canvasHeight,
  CANVAS_W,
  NODE_W,
  NODE_H,
  V_GAP,
  PAD,
  HUB_W,
  HUB_H,
  SPOKE_W,
  SPOKE_H,
  SPOKE_R,
  EQ_W,
  type LayoutInput,
  type LayoutPosition,
} from "../../lib/whiteboard/layoutAdapters";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNodes(
  roles: Array<"hub" | "spoke" | "step" | "left" | "right" | "term" | "value" | "generic">,
): LayoutInput[] {
  return roles.map((role, i) => ({ id: `n${i}`, role }));
}

// ── flowLayout ────────────────────────────────────────────────────────────────

describe("flowLayout", () => {
  it("returns an empty array for empty input", () => {
    expect(flowLayout([])).toHaveLength(0);
  });

  it("returns one position for a single node", () => {
    const result = flowLayout(makeNodes(["step"]));
    expect(result).toHaveLength(1);
  });

  it("all nodes share the same x (centred column)", () => {
    const result = flowLayout(makeNodes(["step", "step", "step"]));
    const xs = result.map((p) => p.x);
    expect(new Set(xs).size).toBe(1);
    // x should be the centred position
    const expectedX = (CANVAS_W - NODE_W) / 2;
    expect(xs[0]).toBe(expectedX);
  });

  it("y values increase with each successive node", () => {
    const result = flowLayout(makeNodes(["step", "step", "step", "step"]));
    for (let i = 1; i < result.length; i++) {
      expect(result[i].y).toBeGreaterThan(result[i - 1].y);
    }
  });

  it("y step equals NODE_H + V_GAP", () => {
    const result = flowLayout(makeNodes(["step", "step"]));
    expect(result[1].y - result[0].y).toBe(NODE_H + V_GAP);
  });

  it("first node y starts at PAD", () => {
    const result = flowLayout(makeNodes(["step"]));
    expect(result[0].y).toBe(PAD);
  });

  it("every node has w=NODE_W and h=NODE_H", () => {
    const result = flowLayout(makeNodes(["step", "step", "step"]));
    for (const p of result) {
      expect(p.w).toBe(NODE_W);
      expect(p.h).toBe(NODE_H);
    }
  });

  it("preserves node ids in output", () => {
    const nodes = makeNodes(["step", "step"]);
    const result = flowLayout(nodes);
    expect(result[0].id).toBe("n0");
    expect(result[1].id).toBe("n1");
  });
});

// ── timelineLayout ────────────────────────────────────────────────────────────

describe("timelineLayout", () => {
  it("returns an empty array for empty input", () => {
    expect(timelineLayout([])).toHaveLength(0);
  });

  it("returns one position for a single node", () => {
    const result = timelineLayout(makeNodes(["step"]));
    expect(result).toHaveLength(1);
  });

  it("x values increase with each successive node", () => {
    const result = timelineLayout(makeNodes(["step", "step", "step", "step"]));
    for (let i = 1; i < result.length; i++) {
      expect(result[i].x).toBeGreaterThan(result[i - 1].x);
    }
  });

  it("all nodes share the same y band (same y value)", () => {
    const result = timelineLayout(makeNodes(["step", "step", "step"]));
    const ys = result.map((p) => p.y);
    expect(new Set(ys).size).toBe(1);
  });

  it("every node has w=120 and h=SPOKE_H", () => {
    const result = timelineLayout(makeNodes(["step", "step"]));
    for (const p of result) {
      expect(p.w).toBe(120);
      expect(p.h).toBe(SPOKE_H);
    }
  });

  it("x step equals item width + H_GAP (140 total)", () => {
    const result = timelineLayout(makeNodes(["step", "step", "step"]));
    // ITEM_W=120, H_GAP=20 → step=140
    const xStep = result[1].x - result[0].x;
    expect(xStep).toBe(140);
  });

  it("preserves node ids in output", () => {
    const nodes = makeNodes(["step", "step"]);
    const result = timelineLayout(nodes);
    expect(result[0].id).toBe("n0");
    expect(result[1].id).toBe("n1");
  });
});

// ── hubSpokeLayout ────────────────────────────────────────────────────────────

describe("hubSpokeLayout", () => {
  it("returns an empty array for empty input", () => {
    expect(hubSpokeLayout([])).toHaveLength(0);
  });

  it("returns one position for a single hub node", () => {
    const result = hubSpokeLayout(makeNodes(["hub"]));
    expect(result).toHaveLength(1);
  });

  it("hub node is placed first in the output array", () => {
    const nodes: LayoutInput[] = [
      { id: "spoke1", role: "spoke" },
      { id: "hub0",   role: "hub" },
      { id: "spoke2", role: "spoke" },
    ];
    const result = hubSpokeLayout(nodes);
    expect(result[0].id).toBe("hub0");
  });

  it("hub node has w=HUB_W and h=HUB_H", () => {
    const result = hubSpokeLayout(makeNodes(["hub", "spoke", "spoke"]));
    const hub = result[0];
    expect(hub.w).toBe(HUB_W);
    expect(hub.h).toBe(HUB_H);
  });

  it("hub node is centred in the canvas area", () => {
    const CX = CANVAS_W / 2;
    const CY = 195;
    const result = hubSpokeLayout(makeNodes(["hub", "spoke"]));
    const hub = result[0];
    // hub x/y are top-left of the centred rect
    expect(hub.x).toBe(CX - HUB_W / 2);
    expect(hub.y).toBe(CY - HUB_H / 2);
  });

  it("spoke nodes have w=SPOKE_W and h=SPOKE_H", () => {
    const result = hubSpokeLayout(makeNodes(["hub", "spoke", "spoke", "spoke"]));
    const spokes = result.slice(1);
    for (const s of spokes) {
      expect(s.w).toBe(SPOKE_W);
      expect(s.h).toBe(SPOKE_H);
    }
  });

  it("spoke nodes are distributed at approximately SPOKE_R from hub centre", () => {
    const CX = CANVAS_W / 2;
    const CY = 195;
    const nodes: LayoutInput[] = [
      { id: "hub", role: "hub" },
      { id: "s1",  role: "spoke" },
      { id: "s2",  role: "spoke" },
      { id: "s3",  role: "spoke" },
      { id: "s4",  role: "spoke" },
    ];
    const result = hubSpokeLayout(nodes);
    const spokes = result.slice(1); // skip hub
    for (const s of spokes) {
      // centre of the spoke node
      const cx = s.x + SPOKE_W / 2;
      const cy = s.y + SPOKE_H / 2;
      const dist = Math.sqrt((cx - CX) ** 2 + (cy - CY) ** 2);
      expect(dist).toBeCloseTo(SPOKE_R, 0);
    }
  });

  it("no spoke node occupies the same position as the hub", () => {
    const nodes: LayoutInput[] = [
      { id: "hub", role: "hub" },
      { id: "s1",  role: "spoke" },
      { id: "s2",  role: "spoke" },
    ];
    const result = hubSpokeLayout(nodes);
    const hub    = result[0];
    const spokes = result.slice(1);
    for (const s of spokes) {
      expect(s.x).not.toBe(hub.x);
      expect(s.y).not.toBe(hub.y);
    }
  });

  it("all returned positions have unique ids matching input", () => {
    const nodes: LayoutInput[] = [
      { id: "hub", role: "hub" },
      { id: "s1",  role: "spoke" },
      { id: "s2",  role: "spoke" },
    ];
    const result = hubSpokeLayout(nodes);
    const ids = result.map((p) => p.id);
    expect(ids).toContain("hub");
    expect(ids).toContain("s1");
    expect(ids).toContain("s2");
  });
});

// ── comparisonLayout ──────────────────────────────────────────────────────────

describe("comparisonLayout", () => {
  it("returns an empty array for empty input", () => {
    expect(comparisonLayout([])).toHaveLength(0);
  });

  it("returns one position for a single node", () => {
    const result = comparisonLayout([{ id: "n0", role: "left" }]);
    expect(result).toHaveLength(1);
  });

  it("left-role nodes are placed in the left column (x = PAD)", () => {
    const nodes: LayoutInput[] = [
      { id: "l1", role: "left" },
      { id: "l2", role: "left" },
      { id: "r1", role: "right" },
    ];
    const result = comparisonLayout(nodes);
    const leftPositions = result.filter((p) => p.id === "l1" || p.id === "l2");
    for (const p of leftPositions) {
      expect(p.x).toBe(PAD);
    }
  });

  it("right-role nodes are placed in the right column", () => {
    const nodes: LayoutInput[] = [
      { id: "l1", role: "left" },
      { id: "r1", role: "right" },
    ];
    const result = comparisonLayout(nodes);
    const right = result.find((p) => p.id === "r1")!;
    // right column x > left column x
    const left  = result.find((p) => p.id === "l1")!;
    expect(right.x).toBeGreaterThan(left.x);
  });

  it("right column x is approximately CANVAS_W / 2", () => {
    const nodes: LayoutInput[] = [
      { id: "l1", role: "left" },
      { id: "r1", role: "right" },
    ];
    const result   = comparisonLayout(nodes);
    const rightPos = result.find((p) => p.id === "r1")!;
    // right x should be roughly half the canvas (PAD + col_w + H_GAP)
    expect(rightPos.x).toBeGreaterThan(CANVAS_W / 2 - 30);
    expect(rightPos.x).toBeLessThan(CANVAS_W / 2 + 30);
  });

  it("each node has h=NODE_H", () => {
    const nodes: LayoutInput[] = [
      { id: "l1", role: "left" },
      { id: "r1", role: "right" },
    ];
    const result = comparisonLayout(nodes);
    for (const p of result) {
      expect(p.h).toBe(NODE_H);
    }
  });

  it("falls back to splitting in half when roles are not 'left'/'right'", () => {
    // Generic roles — should still produce two columns via fallback split
    const nodes: LayoutInput[] = [
      { id: "a", role: "generic" },
      { id: "b", role: "generic" },
      { id: "c", role: "generic" },
      { id: "d", role: "generic" },
    ];
    const result = comparisonLayout(nodes);
    // All four nodes should be placed
    expect(result).toHaveLength(4);
    const xs = [...new Set(result.map((p) => p.x))];
    // Two distinct x values — left and right columns
    expect(xs).toHaveLength(2);
  });

  it("multiple rows: y increases row by row for nodes in the same column", () => {
    const nodes: LayoutInput[] = [
      { id: "l1", role: "left" },
      { id: "l2", role: "left" },
      { id: "r1", role: "right" },
    ];
    const result = comparisonLayout(nodes);
    const l1 = result.find((p) => p.id === "l1")!;
    const l2 = result.find((p) => p.id === "l2")!;
    expect(l2.y).toBeGreaterThan(l1.y);
  });
});

// ── equationLayout ────────────────────────────────────────────────────────────

describe("equationLayout", () => {
  it("returns an empty array for empty input", () => {
    expect(equationLayout([])).toHaveLength(0);
  });

  it("returns one position for a single node", () => {
    const result = equationLayout(makeNodes(["term"]));
    expect(result).toHaveLength(1);
  });

  it("all nodes share the same x (centred)", () => {
    const result = equationLayout(makeNodes(["term", "value", "term", "value"]));
    const xs = result.map((p) => p.x);
    expect(new Set(xs).size).toBe(1);
    const expectedX = (CANVAS_W - EQ_W) / 2;
    expect(xs[0]).toBe(expectedX);
  });

  it("y values increase with each successive node", () => {
    const result = equationLayout(makeNodes(["term", "value", "term"]));
    for (let i = 1; i < result.length; i++) {
      expect(result[i].y).toBeGreaterThan(result[i - 1].y);
    }
  });

  it("every node has w=EQ_W and h=NODE_H", () => {
    const result = equationLayout(makeNodes(["term", "value"]));
    for (const p of result) {
      expect(p.w).toBe(EQ_W);
      expect(p.h).toBe(NODE_H);
    }
  });

  it("first node y starts at PAD", () => {
    const result = equationLayout(makeNodes(["term"]));
    expect(result[0].y).toBe(PAD);
  });

  it("preserves node ids in output", () => {
    const nodes = makeNodes(["term", "value"]);
    const result = equationLayout(nodes);
    expect(result[0].id).toBe("n0");
    expect(result[1].id).toBe("n1");
  });
});

// ── canvasHeight ──────────────────────────────────────────────────────────────

describe("canvasHeight", () => {
  it("returns 300 for empty positions array", () => {
    expect(canvasHeight([])).toBe(300);
  });

  it("returns max(y + h) + PAD for a single node", () => {
    const pos: LayoutPosition[] = [{ id: "n0", x: 10, y: 50, w: 100, h: 40 }];
    expect(canvasHeight(pos)).toBe(50 + 40 + PAD);
  });

  it("picks the node with the greatest bottom edge", () => {
    const positions: LayoutPosition[] = [
      { id: "n0", x: 0, y: 10, w: 100, h: 50  }, // bottom = 60
      { id: "n1", x: 0, y: 30, w: 100, h: 100 }, // bottom = 130  ← max
      { id: "n2", x: 0, y: 20, w: 100, h: 40  }, // bottom = 60
    ];
    expect(canvasHeight(positions)).toBe(130 + PAD);
  });

  it("is consistent with flowLayout output for multiple nodes", () => {
    const nodes = makeNodes(["step", "step", "step"]);
    const positions = flowLayout(nodes);
    const lastPos   = positions[positions.length - 1];
    expect(canvasHeight(positions)).toBe(lastPos.y + lastPos.h + PAD);
  });

  it("adds PAD as the bottom padding", () => {
    const pos: LayoutPosition[] = [{ id: "n0", x: 0, y: 0, w: 10, h: 10 }];
    expect(canvasHeight(pos)).toBe(10 + PAD);
  });
});

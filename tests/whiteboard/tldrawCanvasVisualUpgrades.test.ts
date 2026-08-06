// tests/whiteboard/tldrawCanvasVisualUpgrades.test.ts
// Regression guards for components/whiteboard/TldrawCanvas.tsx — this repo's
// jest config runs testEnvironment: "node" (no jsdom/RTL), so a real render
// isn't available here; these are source-level checks for wiring that IS
// otherwise fully unit-testable (the pure toTldrawShapeSpec/colorForTarget
// logic itself is exercised indirectly through this file's string matching,
// same pattern already used throughout tests/whiteboard/).

import fs from "fs";
import path from "path";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("TldrawCanvas.tsx — EDGE_COLOR is actually applied (was dead code)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: colorForTarget checks vsg.edges when no node matches, returning EDGE_COLOR[edge.kind]", () => {
    const idx = src.indexOf("const colorForTarget = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/const edge = v\.edges\.find\(e => e\.id === targetId\);/);
    expect(block).toMatch(/if \(edge\) return EDGE_COLOR\[edge\.kind\] \?\? fallback;/);
  });

  it("REQUIRED: registerAnchors registers draw-arrow actions too, not just write/draw-shape — without this, an arrow's targetId (the edge id) never reaches colorForTarget at all", () => {
    const idx = src.indexOf("const registerAnchors = useCallback(");
    const block = src.slice(idx, idx + 550);
    expect(block).toMatch(/a\.type === "write" \|\| a\.type === "draw-shape" \|\| a\.type === "draw-arrow"/);
  });
});

describe("TldrawCanvas.tsx — richer geo shape vocabulary (diamond/hexagon/cloud), not just rectangle/ellipse", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: toTldrawShapeSpec's geo branch now accepts diamond/hexagon/cloud shape kinds", () => {
    const idx = src.indexOf("function toTldrawShapeSpec(");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/s\.kind === "diamond" \|\| s\.kind === "hexagon" \|\| s\.kind === "cloud"/);
  });

  it("maps each new kind to tldraw's own built-in geo shape name 1:1 (diamond/hexagon/cloud are real tldraw geo values)", () => {
    const idx = src.indexOf("const GEO_FOR_KIND: Record<string, string> = {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/diamond: "diamond"/);
    expect(block).toMatch(/hexagon: "hexagon"/);
    expect(block).toMatch(/cloud: "cloud"/);
  });
});

describe("TldrawCanvas.tsx — per-step camera padding scales with content, floor raised well above the old flat 40px", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: padding is no longer a flat 40px constant", () => {
    expect(src).not.toMatch(/x: merged\.x - 40, y: merged\.y - 40, w: merged\.w \+ 80, h: merged\.h \+ 80/);
  });

  it("REQUIRED: padX/padY floors are well above the old 40px — the concrete fix for 'the camera zooms in too tight (209%) on a single small box'", () => {
    const idx = src.indexOf("const padX = Math.max(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/const padX = Math\.max\(100, merged\.w \* 0\.3\);/);
    expect(block).toMatch(/const padY = Math\.max\(140, merged\.h \* 1\.2\);/);
  });

  it("padding is still applied via the same zoomToBounds API already used elsewhere in this file (no new/unproven tldraw API surface)", () => {
    const idx = src.indexOf("const padX = Math.max(");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/editor\.zoomToBounds\(/);
  });

  it("a full zoomToFit still happens before any step has run (index === -1) — only the PER-STEP crop changed, not the initial whole-scene view", () => {
    expect(src).toMatch(/else if \(index === -1\) \{\s*\n\s*editor\.zoomToFit\(\);/);
  });
});

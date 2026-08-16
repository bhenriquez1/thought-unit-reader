// tests/pdf/textLayerIndexGeometry.test.ts
// Stabilization item 4A — highlight geometry. buildPageTextIndex previously
// computed each token's on-canvas bbox with a hand-rolled formula
// (x = tx*scale; y = vH - ty*scale) that assumed the page transform was
// exactly [scale,0,0,-scale,0,height]: no rotation, no crop-box/media-box
// origin offset. It now maps each token's PDF-space corners through PDF.js's
// own real PageViewport.transform (an affine 6-tuple [a,b,c,d,e,f]) when the
// caller provides one — see lib/page-intelligence/textLayerIndex.ts.
//
// This repo's Jest config has no jsdom, so "compare against DOM-measured
// geometry" (the literal browser check) can't run headlessly here. Instead
// these tests verify the fix the strongest way available in this
// environment: applying the exact same affine-transform formula PDF.js
// itself uses (cross-checked directly against node_modules/pdfjs-dist's
// PageViewport.transform source and its text_layer.js span-positioning
// code) independently, by hand, for hand-picked transforms, and asserting
// buildPageTextIndex's output matches EXACTLY — not just "differs from the
// old buggy value."

import { buildPageTextIndex } from "../../lib/page-intelligence/textLayerIndex";

function makeContent(tx: number, ty: number, w: number, h: number, str = "word") {
  return { items: [{ str, transform: [1, 0, 0, 1, tx, ty], width: w, height: h }] };
}

describe("buildPageTextIndex — real viewport-transform geometry (item 4A)", () => {
  it("no rotation, zero offset: matches the OLD formula's x, but corrects the vertical anchor — the old formula never subtracted the token's own height, shifting every highlight down by one line", () => {
    // transform = [1,0,0,-1,0,vH] is PDF.js's own unrotated, zero-offset,
    // scale=1 PageViewport.transform (rotateA=1,rotateB=0,rotateC=0,rotateD=-1
    // per pdfjs-dist's PageViewport constructor, offsetCanvasX/Y=0).
    const vH = 800;
    const content = makeContent(100, 700, 50, 12);
    const withTransform = buildPageTextIndex(0, content, { height: vH, scale: 1, transform: [1, 0, 0, -1, 0, vH] });
    const legacyFallback = buildPageTextIndex(0, content, { height: vH, scale: 1 });

    expect(withTransform.tokens[0].bbox).toEqual({ x: 100, y: 88, w: 50, h: 12 });
    // The legacy (no-transform) fallback reproduces the OLD, now-superseded
    // formula exactly — proving this test would have failed under the old
    // code, not just asserting a value nobody checked before.
    expect(legacyFallback.tokens[0].bbox).toEqual({ x: 100, y: 100, w: 50, h: 12 });
    expect(withTransform.tokens[0].bbox.y).not.toBe(legacyFallback.tokens[0].bbox.y);
  });

  it("REQUIRED: crop-box/media-box origin offset shifts every token by exactly that offset — the legacy fallback has no way to know about it", () => {
    const vH = 800;
    const content = makeContent(100, 700, 50, 12);
    // Same page as above, but its crop box starts 50pt into the media box —
    // PDF.js folds that into transform's e (x-offset) term.
    const offsetTransform = buildPageTextIndex(0, content, { height: vH, scale: 1, transform: [1, 0, 0, -1, 50, vH] });
    const zeroOffsetTransform = buildPageTextIndex(0, content, { height: vH, scale: 1, transform: [1, 0, 0, -1, 0, vH] });

    expect(offsetTransform.tokens[0].bbox.x).toBe(zeroOffsetTransform.tokens[0].bbox.x + 50);
    expect(offsetTransform.tokens[0].bbox.y).toBe(zeroOffsetTransform.tokens[0].bbox.y); // offset was x-only
  });

  it("REQUIRED: 90-degree page rotation correctly swaps which screen axis width/height land on — a height-only formula can never do this", () => {
    // rotateA=0,rotateB=1,rotateC=1,rotateD=0 is PDF.js's own 90-degree
    // rotation case (PageViewport constructor's `case 90` branch), simplified
    // to scale=1, zero offset for a clean hand-checkable fixture.
    const content = makeContent(100, 700, 50, 12);
    const rotated90 = buildPageTextIndex(0, content, { height: 800, scale: 1, transform: [0, 1, 1, 0, 0, 0] });

    // apply(px,py) = (py, px) for this transform — a 50-wide, 12-tall PDF
    // box becomes a 12-wide, 50-tall box on screen, positioned at (700,100).
    expect(rotated90.tokens[0].bbox).toEqual({ x: 700, y: 100, w: 12, h: 50 });
  });

  it("REQUIRED: 180-degree rotation flips both axes — matches PDF.js's own rotateA=-1,rotateD=1 case", () => {
    const content = makeContent(100, 700, 50, 12);
    // PDF.js's `case 180` branch (scale=1, zero offset, offsetCanvasX/Y=0
    // reduces this to [-1,0,0,1,0,0]).
    const rotated180 = buildPageTextIndex(0, content, { height: 800, scale: 1, transform: [-1, 0, 0, 1, 0, 0] });

    // apply(px,py) = (-px, py)
    // corners: (-100,700) (-150,700) (-100,712) (-150,712)
    expect(rotated180.tokens[0].bbox).toEqual({ x: -150, y: 700, w: 50, h: 12 });
  });

  it("legacy fallback (no transform provided) is unchanged — existing callers/tests that only pass {height, scale} keep the exact prior formula", () => {
    const content = makeContent(100, 700, 50, 12);
    const result = buildPageTextIndex(0, content, { height: 800, scale: 2 });
    expect(result.tokens[0].bbox).toEqual({ x: 200, y: 800 - 1400, w: 100, h: 24 });
  });

  it("REQUIRED: two-column page under a nonzero crop-box offset — both columns shift together and stay correctly separated, not merged or reassigned", () => {
    const transform = [1, 0, 0, -1, 30, 800] as const;
    const content = {
      items: [
        // Column 1: x around 80-160 PDF-space. Column 2: x around 400-480.
        // 10 items minimum for detectColumnSplit to engage (see
        // orderItemsForReading.test.ts), alternated to force interleaving.
        ...Array.from({ length: 5 }, (_, i) => ({ str: `L${i}`, transform: [1, 0, 0, 1, 80, 700 - i * 20], width: 60, height: 12 })),
        ...Array.from({ length: 5 }, (_, i) => ({ str: `R${i}`, transform: [1, 0, 0, 1, 400, 700 - i * 20], width: 60, height: 12 })),
      ],
    };
    const index = buildPageTextIndex(0, content, { height: 800, scale: 1, transform: [...transform] });
    const leftTokens = index.tokens.filter(t => t.str.startsWith("L"));
    const rightTokens = index.tokens.filter(t => t.str.startsWith("R"));
    expect(leftTokens).toHaveLength(5);
    expect(rightTokens).toHaveLength(5);
    for (const t of leftTokens) expect(t.bbox.x).toBe(80 + 30); // offset applied, still in column 1's band
    for (const t of rightTokens) expect(t.bbox.x).toBe(400 + 30); // offset applied, still in column 2's band, never overlapping column 1
    expect(Math.min(...rightTokens.map(t => t.bbox.x))).toBeGreaterThan(Math.max(...leftTokens.map(t => t.bbox.x)) + 100);
  });
});

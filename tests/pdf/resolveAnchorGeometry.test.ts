// tests/pdf/resolveAnchorGeometry.test.ts
// Phase 2 regression tests for resolveAnchorGeometry()
//
//   1.  Zoom — scale=1.5 multiplies all coordinates by 1.5
//   2.  Multi-column — left and right column items never mix
//   3.  Exact itemIndex lookup — primary strategy
//   4.  Char-offset fallback — used when pdfTextItemIndexes absent
//   5.  Quote fallback — substring search in fullText
//   6.  Repeated text — first occurrence wins
//   7.  Ligature item — single itemIndex covering multi-char glyph resolves correctly
//   8.  Rotated page — unusual x/y values still scaled correctly
//   9.  OCR page — groundingState "ocr" resolves (not blocked like "synthetic")
//  10.  Synthetic anchor — always returns []
//  11.  Paragraph spanning multiple items — same-line items merged into one rect
//  12.  Multi-line paragraph — different lines produce separate rects
//  13.  No registry entry for page → returns []
//  14.  Empty pdfTextItemIndexes list → falls through to char-offset strategy
//  15.  Quote too short (< 10 chars) → not used in fallback

import { resolveAnchorGeometry } from "../../lib/pdf/resolveAnchorGeometry";
import { TextLayerRegistry } from "../../lib/page-intelligence/textLayerIndex";
import type { PageTextIndex } from "../../lib/page-intelligence/textLayerIndex";
import type { ReaderAnchor } from "../../lib/canonical/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal PageTextIndex from a flat list of token descriptors. */
function makeIndex(
  pageIndex: number,
  tokens: Array<{
    str: string;
    x: number;
    y: number;
    w: number;
    h: number;
    itemIndex?: number;
  }>,
): PageTextIndex {
  let cursor = 0;
  const built: PageTextIndex["tokens"] = tokens.map((t, i) => {
    const startChar = cursor;
    const endChar   = cursor + t.str.length;
    cursor = endChar + 1; // +1 for the inter-token space added by buildPageTextIndex
    return {
      str: t.str,
      startChar,
      endChar,
      bbox: { x: t.x, y: t.y, w: t.w, h: t.h },
      itemIndex: t.itemIndex ?? i,
    };
  });

  const fullText = tokens.map(t => t.str).join(" ");
  return { pageIndex, fullText, tokens: built };
}

/** Build a minimal ReaderAnchor. */
function makeAnchor(
  overrides: Partial<ReaderAnchor> & { pageIndex: number; startChar: number; endChar: number },
): ReaderAnchor {
  return {
    quote: "",
    ...overrides,
  } as ReaderAnchor;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => TextLayerRegistry.clear());
afterEach(() => TextLayerRegistry.clear());

// ── Test 1: Zoom ──────────────────────────────────────────────────────────────

describe("resolveAnchorGeometry — zoom", () => {
  it("scales all coordinates by viewportScale", () => {
    TextLayerRegistry.set(
      makeIndex(0, [{ str: "hello", x: 100, y: 200, w: 50, h: 12, itemIndex: 0 }]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 5,
      pdfTextItemIndexes: [0],
    });

    const rects = resolveAnchorGeometry(anchor, 1.5);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeCloseTo(150);
    expect(rects[0].y).toBeCloseTo(300);
    expect(rects[0].w).toBeCloseTo(75);
    expect(rects[0].h).toBeCloseTo(18);
  });

  it("scale=1.0 returns PDF-point coordinates unchanged", () => {
    TextLayerRegistry.set(
      makeIndex(0, [{ str: "ATP", x: 72, y: 600, w: 30, h: 10, itemIndex: 0 }]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 3,
      pdfTextItemIndexes: [0],
    });

    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects[0]).toEqual({ x: 72, y: 600, w: 30, h: 10 });
  });

  it("scale=2.0 doubles all coordinates", () => {
    TextLayerRegistry.set(
      makeIndex(0, [{ str: "ion", x: 10, y: 20, w: 15, h: 8, itemIndex: 0 }]),
    );
    const anchor = makeAnchor({ pageIndex: 0, startChar: 0, endChar: 3, pdfTextItemIndexes: [0] });
    const rects = resolveAnchorGeometry(anchor, 2.0);
    expect(rects[0]).toEqual({ x: 20, y: 40, w: 30, h: 16 });
  });
});

// ── Test 2: Multi-column ──────────────────────────────────────────────────────

describe("resolveAnchorGeometry — multi-column isolation", () => {
  it("left-column anchor does not include right-column items", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "left",  x: 50,  y: 100, w: 60, h: 12, itemIndex: 0 },
        { str: "right", x: 350, y: 100, w: 60, h: 12, itemIndex: 1 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 4,
      pdfTextItemIndexes: [0], // only left-column item
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(50);
  });

  it("right-column anchor does not include left-column items", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "left",  x: 50,  y: 100, w: 60, h: 12, itemIndex: 0 },
        { str: "right", x: 350, y: 100, w: 60, h: 12, itemIndex: 1 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 5,
      endChar: 10,
      pdfTextItemIndexes: [1], // only right-column item
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(350);
  });

  it("widely separated same-line items are NOT merged (cross-column gap exceeds tolerance)", () => {
    // Column gap is 200 pt; em ≈ 12 pt — well beyond the merge threshold.
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "A", x: 50,  y: 100, w: 10, h: 12, itemIndex: 0 },
        { str: "B", x: 260, y: 100, w: 10, h: 12, itemIndex: 1 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 3,
      pdfTextItemIndexes: [0, 1],
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(2);
  });
});

// ── Test 3: Exact itemIndex lookup ────────────────────────────────────────────

describe("resolveAnchorGeometry — exact itemIndex strategy", () => {
  it("resolves items by itemIndex even when startChar/endChar would not match", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "skip", x: 0,  y: 0,  w: 30, h: 10, itemIndex: 0 },
        { str: "find", x: 40, y: 0,  w: 30, h: 10, itemIndex: 1 },
      ]),
    );
    // Anchor with wrong char offsets but correct itemIndex
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 999,
      endChar: 999,
      pdfTextItemIndexes: [1],
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(40);
  });
});

// ── Test 4: Char-offset fallback ──────────────────────────────────────────────

describe("resolveAnchorGeometry — char-offset fallback", () => {
  it("falls back to char-offset when pdfTextItemIndexes is absent", () => {
    const idx = makeIndex(0, [
      { str: "before", x: 0,   y: 0, w: 40, h: 10, itemIndex: 0 },
      { str: "target", x: 50,  y: 0, w: 40, h: 10, itemIndex: 1 },
      { str: "after",  x: 100, y: 0, w: 40, h: 10, itemIndex: 2 },
    ]);
    TextLayerRegistry.set(idx);

    // target token occupies chars 7..13 (after "before" + space)
    const targetToken = idx.tokens[1];
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: targetToken.startChar,
      endChar: targetToken.endChar,
      // no pdfTextItemIndexes
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(50);
  });

  it("empty pdfTextItemIndexes array triggers char-offset fallback", () => {
    const idx = makeIndex(0, [
      { str: "word", x: 20, y: 10, w: 30, h: 10, itemIndex: 0 },
    ]);
    TextLayerRegistry.set(idx);
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: idx.tokens[0].startChar,
      endChar: idx.tokens[0].endChar,
      pdfTextItemIndexes: [], // explicitly empty
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(20);
  });
});

// ── Test 5: Quote fallback ────────────────────────────────────────────────────

describe("resolveAnchorGeometry — quote fallback", () => {
  it("resolves via normalizedSourceText when char offsets miss", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "Enamel", x: 10, y: 20, w: 50, h: 12, itemIndex: 0 },
        { str: "is",     x: 65, y: 20, w: 15, h: 12, itemIndex: 1 },
        { str: "hard",   x: 85, y: 20, w: 30, h: 12, itemIndex: 2 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 9999, // intentionally wrong
      endChar: 9999,
      normalizedSourceText: "Enamel is hard",
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects.length).toBeGreaterThan(0);
  });

  it("resolves via anchor.quote when normalizedSourceText absent", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "Bacteria", x: 0, y: 50, w: 60, h: 12, itemIndex: 0 },
        { str: "cause",    x: 65, y: 50, w: 40, h: 12, itemIndex: 1 },
        { str: "caries",   x: 110, y: 50, w: 50, h: 12, itemIndex: 2 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 9999,
      endChar: 9999,
      quote: "Bacteria cause caries",
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects.length).toBeGreaterThan(0);
  });
});

// ── Test 6: Repeated text ─────────────────────────────────────────────────────

describe("resolveAnchorGeometry — repeated text", () => {
  it("returns the first occurrence when the quote appears multiple times", () => {
    // "ATP" appears at x=10 then x=200 on the same page
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "ATP", x: 10,  y: 100, w: 25, h: 10, itemIndex: 0 },
        { str: "and", x: 40,  y: 100, w: 20, h: 10, itemIndex: 1 },
        { str: "ATP", x: 200, y: 100, w: 25, h: 10, itemIndex: 2 },
      ]),
    );
    // Use quote fallback (omit pdfTextItemIndexes and use bogus char offsets)
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 9999,
      endChar: 9999,
      quote: "ATP",
      normalizedSourceText: "ATP",
    });
    // "ATP" < 10 chars — quote strategy skips; verify returns [] not second hit
    const rects = resolveAnchorGeometry(anchor, 1.0);
    // quote too short (3 < 10) → quote strategy skipped → char offset misses → []
    expect(rects).toHaveLength(0);
  });

  it("first-occurrence wins for a longer repeated phrase", () => {
    // Two lines both containing "cell membrane" but the first is at y=100
    TextLayerRegistry.set({
      pageIndex: 0,
      fullText: "the cell membrane is a lipid bilayer and the cell membrane allows transport",
      tokens: [
        { str: "the",        startChar: 0,  endChar: 3,  bbox: { x: 0,  y: 100, w: 20, h: 10 }, itemIndex: 0 },
        { str: "cell",       startChar: 4,  endChar: 8,  bbox: { x: 25, y: 100, w: 25, h: 10 }, itemIndex: 1 },
        { str: "membrane",   startChar: 9,  endChar: 17, bbox: { x: 55, y: 100, w: 50, h: 10 }, itemIndex: 2 },
        { str: "is",         startChar: 18, endChar: 20, bbox: { x: 0,  y: 120, w: 15, h: 10 }, itemIndex: 3 },
        { str: "the",        startChar: 40, endChar: 43, bbox: { x: 0,  y: 140, w: 20, h: 10 }, itemIndex: 4 },
        { str: "cell",       startChar: 44, endChar: 48, bbox: { x: 25, y: 140, w: 25, h: 10 }, itemIndex: 5 },
        { str: "membrane",   startChar: 49, endChar: 57, bbox: { x: 55, y: 140, w: 50, h: 10 }, itemIndex: 6 },
        { str: "allows",     startChar: 58, endChar: 64, bbox: { x: 0,  y: 160, w: 40, h: 10 }, itemIndex: 7 },
      ],
    });
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 9999,
      endChar: 9999,
      normalizedSourceText: "the cell membrane is a lipid bilayer",
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    // Should match starting at y=100, not y=140
    expect(rects.some(r => r.y <= 100)).toBe(true);
    expect(rects.every(r => r.y <= 130)).toBe(true); // no rects from second "the cell membrane"
  });
});

// ── Test 7: Ligature item ─────────────────────────────────────────────────────

describe("resolveAnchorGeometry — ligature", () => {
  it("resolves a single-item ligature glyph (e.g. fi) correctly by itemIndex", () => {
    // PDF.js may produce a single item with str="ﬁ" (fi ligature) for 2 visual chars.
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "ﬁeld", x: 10, y: 30, w: 30, h: 12, itemIndex: 5 }, // non-zero itemIndex
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 5,
      pdfTextItemIndexes: [5],
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(10);
    expect(rects[0].w).toBe(30);
  });
});

// ── Test 8: Rotated page ──────────────────────────────────────────────────────

describe("resolveAnchorGeometry — rotated page", () => {
  it("applies viewportScale to rotated-page bboxes without modification", () => {
    // On a 90°-rotated page, PDF.js may give unusual x/y values.
    // resolveAnchorGeometry just multiplies — no rotation handling needed here.
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "rotated", x: 700, y: 50, w: 40, h: 12, itemIndex: 0 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 7,
      pdfTextItemIndexes: [0],
    });
    const rects = resolveAnchorGeometry(anchor, 1.5);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeCloseTo(1050);
    expect(rects[0].y).toBeCloseTo(75);
  });
});

// ── Test 9: OCR page ──────────────────────────────────────────────────────────

describe("resolveAnchorGeometry — OCR groundingState", () => {
  it("resolves anchors with groundingState 'ocr' (not blocked like 'synthetic')", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "Enamel", x: 20, y: 80, w: 45, h: 12, itemIndex: 2 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 6,
      pdfTextItemIndexes: [2],
      groundingState: "ocr",
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(20);
  });
});

// ── Test 10: Synthetic anchor ─────────────────────────────────────────────────

describe("resolveAnchorGeometry — synthetic anchor", () => {
  it("returns [] immediately for groundingState 'synthetic'", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "anything", x: 0, y: 0, w: 50, h: 10, itemIndex: 0 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 8,
      pdfTextItemIndexes: [0],
      groundingState: "synthetic",
    });
    expect(resolveAnchorGeometry(anchor, 1.0)).toHaveLength(0);
  });
});

// ── Test 11: Paragraph spanning multiple items (same line) ────────────────────

describe("resolveAnchorGeometry — multi-item paragraph", () => {
  it("merges adjacent same-line tokens into a single rect", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "Enamel",  x: 0,   y: 100, w: 50, h: 12, itemIndex: 0 },
        { str: "is",      x: 55,  y: 100, w: 15, h: 12, itemIndex: 1 },
        { str: "defined", x: 75,  y: 100, w: 50, h: 12, itemIndex: 2 },
        { str: "as",      x: 130, y: 100, w: 15, h: 12, itemIndex: 3 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 20,
      pdfTextItemIndexes: [0, 1, 2, 3],
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(0);
    expect(rects[0].w).toBeCloseTo(145); // 130 + 15 - 0
  });
});

// ── Test 12: Multi-line paragraph ─────────────────────────────────────────────

describe("resolveAnchorGeometry — multi-line paragraph", () => {
  it("keeps different lines as separate rects", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "First",  x: 0, y: 100, w: 40, h: 12, itemIndex: 0 },
        { str: "line",   x: 45, y: 100, w: 30, h: 12, itemIndex: 1 },
        { str: "Second", x: 0, y: 120, w: 50, h: 12, itemIndex: 2 }, // new line (gap > 60% of h)
        { str: "line",   x: 55, y: 120, w: 30, h: 12, itemIndex: 3 },
      ]),
    );
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 0,
      endChar: 30,
      pdfTextItemIndexes: [0, 1, 2, 3],
    });
    const rects = resolveAnchorGeometry(anchor, 1.0);
    expect(rects).toHaveLength(2);
    expect(rects[0].y).toBe(100);
    expect(rects[1].y).toBe(120);
  });
});

// ── Test 13: No registry entry ────────────────────────────────────────────────

describe("resolveAnchorGeometry — missing registry entry", () => {
  it("returns [] when the TextLayerRegistry has no entry for the page", () => {
    // Do not register anything for page 0
    const anchor = makeAnchor({ pageIndex: 0, startChar: 0, endChar: 5 });
    expect(resolveAnchorGeometry(anchor, 1.0)).toHaveLength(0);
  });

  it("resolves a different page correctly when only that page is registered", () => {
    TextLayerRegistry.set(
      makeIndex(3, [{ str: "page3", x: 10, y: 10, w: 40, h: 12, itemIndex: 0 }]),
    );
    const anchor = makeAnchor({ pageIndex: 0, startChar: 0, endChar: 5 });
    expect(resolveAnchorGeometry(anchor, 1.0)).toHaveLength(0);

    const anchor3 = makeAnchor({ pageIndex: 3, startChar: 0, endChar: 5, pdfTextItemIndexes: [0] });
    expect(resolveAnchorGeometry(anchor3, 1.0)).toHaveLength(1);
  });
});

// ── Test 14: Empty pdfTextItemIndexes fallthrough ─────────────────────────────

// Covered in Test 4 above.

// ── Test 15: Quote too short ──────────────────────────────────────────────────

describe("resolveAnchorGeometry — quote too short", () => {
  it("skips the quote strategy for strings shorter than 10 chars", () => {
    TextLayerRegistry.set(
      makeIndex(0, [{ str: "ATP", x: 10, y: 10, w: 20, h: 10, itemIndex: 0 }]),
    );
    // char offsets miss; quote "ATP" is only 3 chars
    const anchor = makeAnchor({
      pageIndex: 0,
      startChar: 999,
      endChar: 999,
      quote: "ATP",
      normalizedSourceText: "ATP",
    });
    expect(resolveAnchorGeometry(anchor, 1.0)).toHaveLength(0);
  });
});

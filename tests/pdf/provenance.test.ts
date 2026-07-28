// tests/pdf/provenance.test.ts
// Phase 1A regression tests:
//   1. buildPageTextIndex() is deterministic (same input → identical output)
//   2. buildStructuredPageText() is deterministic (same items → identical text)
//   3. TextLayerRegistry round-trips correctly
//   4. makeStructuredPageText() wraps text in the versioned contract
//   5. Item-index mapping survives two independent passes

import {
  buildPageTextIndex,
  TextLayerRegistry,
} from "../../lib/page-intelligence/textLayerIndex";

import {
  buildStructuredPageText,
  makeStructuredPageText,
  STRUCTURE_VERSION,
  PARAGRAPH_ALGORITHM_VERSION,
} from "../../lib/pdf/structuredPageText";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Minimal mock of a PDF.js textContent for a single-column page.
 *
 * Layout (PDF Y increases upward):
 *   Paragraph 1 — three lines at y=750, 738, 726 (12 pt line spacing)
 *   [Inter-paragraph gap = 50 pt — well above 1.4× median of 12]
 *   Paragraph 2 — three lines at y=676, 664, 652 (12 pt line spacing)
 *
 * Gaps: [12, 12, 50, 12, 12]  →  sorted [12,12,12,12,50]  →  median = 12
 * Paragraph break fires when gap > 12 × 1.4 = 16.8 — the 50 pt gap qualifies.
 */
const SINGLE_COLUMN_CONTENT = {
  items: [
    // Paragraph 1, line 1 (y=750)
    { str: "The", transform: [1, 0, 0, 1, 50, 750], width: 20, height: 12 },
    { str: "mitochondria", transform: [1, 0, 0, 1, 75, 750], width: 80, height: 12 },
    { str: "is", transform: [1, 0, 0, 1, 160, 750], width: 12, height: 12 },
    // Paragraph 1, line 2 (y=738, gap=12)
    { str: "the", transform: [1, 0, 0, 1, 50, 738], width: 16, height: 12 },
    { str: "powerhouse", transform: [1, 0, 0, 1, 71, 738], width: 65, height: 12 },
    { str: "of", transform: [1, 0, 0, 1, 141, 738], width: 12, height: 12 },
    // Paragraph 1, line 3 (y=726, gap=12)
    { str: "the", transform: [1, 0, 0, 1, 50, 726], width: 16, height: 12 },
    { str: "cell.", transform: [1, 0, 0, 1, 71, 726], width: 28, height: 12 },
    // — paragraph gap = 50 pt (well above 1.4 × 12 = 16.8) —
    // Paragraph 2, line 1 (y=676, gap=50)
    { str: "ATP", transform: [1, 0, 0, 1, 50, 676], width: 30, height: 12 },
    { str: "synthesis", transform: [1, 0, 0, 1, 85, 676], width: 55, height: 12 },
    { str: "occurs", transform: [1, 0, 0, 1, 145, 676], width: 40, height: 12 },
    // Paragraph 2, line 2 (y=664, gap=12)
    { str: "via", transform: [1, 0, 0, 1, 50, 664], width: 18, height: 12 },
    { str: "oxidative", transform: [1, 0, 0, 1, 73, 664], width: 52, height: 12 },
    // Paragraph 2, line 3 (y=652, gap=12)
    { str: "phosphorylation.", transform: [1, 0, 0, 1, 50, 652], width: 90, height: 12 },
  ],
};

const VIEWPORT = { height: 800, scale: 1 };

// ── buildPageTextIndex determinism ────────────────────────────────────────────

describe("buildPageTextIndex — determinism", () => {
  it("produces identical output on two independent calls with the same input", () => {
    const first  = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    const second = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);

    expect(first.pageIndex).toBe(second.pageIndex);
    expect(first.fullText).toBe(second.fullText);
    expect(first.tokens.length).toBe(second.tokens.length);

    for (let i = 0; i < first.tokens.length; i++) {
      const a = first.tokens[i];
      const b = second.tokens[i];
      expect(a.str).toBe(b.str);
      expect(a.startChar).toBe(b.startChar);
      expect(a.endChar).toBe(b.endChar);
      expect(a.itemIndex).toBe(b.itemIndex);
      expect(a.bbox.x).toBe(b.bbox.x);
      expect(a.bbox.y).toBe(b.bbox.y);
      expect(a.bbox.w).toBe(b.bbox.w);
      expect(a.bbox.h).toBe(b.bbox.h);
    }
  });

  it("records correct item indexes (matches position in items array)", () => {
    const index = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    // Every token's itemIndex should equal its position in the original items array
    for (const token of index.tokens) {
      expect(SINGLE_COLUMN_CONTENT.items[token.itemIndex].str).toBe(token.str);
    }
  });

  it("item indexes are monotonically non-decreasing", () => {
    const index = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    for (let i = 1; i < index.tokens.length; i++) {
      expect(index.tokens[i].itemIndex).toBeGreaterThan(index.tokens[i - 1].itemIndex);
    }
  });

  it("produces identical geometry on two passes (bounding boxes are stable)", () => {
    const first  = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    const second = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    const boxesA = first.tokens.map(t => t.bbox);
    const boxesB = second.tokens.map(t => t.bbox);
    expect(boxesA).toEqual(boxesB);
  });
});

// ── buildStructuredPageText determinism ───────────────────────────────────────

describe("buildStructuredPageText — determinism", () => {
  const items = SINGLE_COLUMN_CONTENT.items.map(it => ({ str: it.str, transform: it.transform }));

  it("produces identical text on two independent calls", () => {
    const first  = buildStructuredPageText(items);
    const second = buildStructuredPageText(items);
    expect(first).toBe(second);
  });

  it("uses \\n\\n as paragraph separator", () => {
    const text = buildStructuredPageText(items);
    expect(text).toContain("\n\n");
  });

  it("output is byte-for-byte identical across repeated calls", () => {
    const results = Array.from({ length: 5 }, () => buildStructuredPageText(items));
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });
});

// ── TextLayerRegistry round-trip ─────────────────────────────────────────────

describe("TextLayerRegistry", () => {
  beforeEach(() => {
    TextLayerRegistry.clear();
  });

  it("stores and retrieves a PageTextIndex by pageIndex", () => {
    const idx = buildPageTextIndex(3, SINGLE_COLUMN_CONTENT, VIEWPORT);
    TextLayerRegistry.set(idx);
    expect(TextLayerRegistry.get(3)).toBe(idx);
  });

  it("returns undefined for an unregistered page", () => {
    expect(TextLayerRegistry.get(99)).toBeUndefined();
  });

  it("overwrites an existing entry for the same pageIndex", () => {
    const first  = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    const second = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    TextLayerRegistry.set(first);
    TextLayerRegistry.set(second);
    expect(TextLayerRegistry.get(0)).toBe(second);
  });

  it("clear() removes all entries", () => {
    TextLayerRegistry.set(buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT));
    TextLayerRegistry.set(buildPageTextIndex(1, SINGLE_COLUMN_CONTENT, VIEWPORT));
    TextLayerRegistry.clear();
    expect(TextLayerRegistry.get(0)).toBeUndefined();
    expect(TextLayerRegistry.get(1)).toBeUndefined();
  });

  it("two passes with identical input produce registry contents with identical tokens", () => {
    // Simulate extracting the same page twice (e.g. after a registry clear + re-extract)
    const first  = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    TextLayerRegistry.set(first);
    const stored1 = TextLayerRegistry.get(0)!;

    TextLayerRegistry.clear();

    const second = buildPageTextIndex(0, SINGLE_COLUMN_CONTENT, VIEWPORT);
    TextLayerRegistry.set(second);
    const stored2 = TextLayerRegistry.get(0)!;

    expect(stored1.fullText).toBe(stored2.fullText);
    expect(stored1.tokens.length).toBe(stored2.tokens.length);
    expect(stored1.tokens.map(t => t.itemIndex)).toEqual(stored2.tokens.map(t => t.itemIndex));
    expect(stored1.tokens.map(t => t.bbox)).toEqual(stored2.tokens.map(t => t.bbox));
  });
});

// ── StructuredPageText contract ───────────────────────────────────────────────

describe("makeStructuredPageText", () => {
  it("wraps text in the versioned contract", () => {
    const spt = makeStructuredPageText("hello world");
    expect(spt.text).toBe("hello world");
    expect(spt.structureVersion).toBe(STRUCTURE_VERSION);
    expect(spt.paragraphAlgorithmVersion).toBe(PARAGRAPH_ALGORITHM_VERSION);
    expect(typeof spt.createdAt).toBe("number");
  });

  it("is frozen (immutable)", () => {
    const spt = makeStructuredPageText("test");
    expect(Object.isFrozen(spt)).toBe(true);
  });

  it("text field is byte-for-byte identical to input", () => {
    const input = buildStructuredPageText(
      SINGLE_COLUMN_CONTENT.items.map(it => ({ str: it.str, transform: it.transform })),
    );
    const spt = makeStructuredPageText(input);
    expect(spt.text).toBe(input);
  });

  it("structureVersion and paragraphAlgorithmVersion are positive integers", () => {
    const spt = makeStructuredPageText("");
    expect(Number.isInteger(spt.structureVersion)).toBe(true);
    expect(spt.structureVersion).toBeGreaterThan(0);
    expect(Number.isInteger(spt.paragraphAlgorithmVersion)).toBe(true);
    expect(spt.paragraphAlgorithmVersion).toBeGreaterThan(0);
  });
});

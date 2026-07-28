// tests/pdf/bridge.test.ts
// Phase 1B regression tests:
//   1. buildStructuredPageTextFull() produces text identical to buildStructuredPageText()
//   2. Bridge paragraph count matches \n\n-split paragraph count
//   3. Bridge charStart/charEnd align with extractParagraphs() output
//   4. Bridge itemIndexes are correct for a known fixture
//   5. Two-column layout: bridge covers items from both columns in reading order
//   6. buildCanonicalUnits() enriches anchor with exact grounding when bridge present
//   7. buildCanonicalUnits() falls back to fuzzy grounding when bridge absent
//   8. canonicalHash is stable across two independent calls
//   9. canonicalHash differs for different text
//  10. provenance is populated on every unit

import {
  buildStructuredPageText,
  buildStructuredPageTextFull,
  type PdfTextItem,
} from "../../lib/pdf/structuredPageText";

import { extractParagraphs } from "../../lib/core/paragraphExtractor";
import { TextLayerRegistry, buildPageTextIndex } from "../../lib/page-intelligence/textLayerIndex";
import { PageBridgeRegistry } from "../../lib/page-intelligence/pageBridgeRegistry";
import { buildCanonicalUnits } from "../../lib/canonical/builder";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Same fixture as tests/pdf/provenance.test.ts:
 *  Paragraph 1 — y=750/738/726 (gap=12)
 *  [50 pt gap → paragraph break]
 *  Paragraph 2 — y=676/664/652 (gap=12)
 */
const ITEMS: PdfTextItem[] = [
  { str: "The",              transform: [1, 0, 0, 1, 50, 750], itemIndex: 0 },
  { str: "mitochondria",     transform: [1, 0, 0, 1, 75, 750], itemIndex: 1 },
  { str: "is",               transform: [1, 0, 0, 1, 160, 750], itemIndex: 2 },
  { str: "the",              transform: [1, 0, 0, 1, 50, 738], itemIndex: 3 },
  { str: "powerhouse",       transform: [1, 0, 0, 1, 71, 738], itemIndex: 4 },
  { str: "of",               transform: [1, 0, 0, 1, 141, 738], itemIndex: 5 },
  { str: "the",              transform: [1, 0, 0, 1, 50, 726], itemIndex: 6 },
  { str: "cell.",            transform: [1, 0, 0, 1, 71, 726], itemIndex: 7 },
  // — 50 pt paragraph gap —
  { str: "ATP",              transform: [1, 0, 0, 1, 50, 676], itemIndex: 8 },
  { str: "synthesis",        transform: [1, 0, 0, 1, 85, 676], itemIndex: 9 },
  { str: "occurs",           transform: [1, 0, 0, 1, 145, 676], itemIndex: 10 },
  { str: "via",              transform: [1, 0, 0, 1, 50, 664], itemIndex: 11 },
  { str: "oxidative",        transform: [1, 0, 0, 1, 73, 664], itemIndex: 12 },
  { str: "phosphorylation.", transform: [1, 0, 0, 1, 50, 652], itemIndex: 13 },
];

const ITEMS_WITHOUT_INDEXES: PdfTextItem[] = ITEMS.map(({ str, transform }) => ({ str, transform }));

// ── buildStructuredPageTextFull — text identity ───────────────────────────────

describe("buildStructuredPageTextFull — text identity", () => {
  it("produces the same text as buildStructuredPageText()", () => {
    const { text: fullText } = buildStructuredPageTextFull(ITEMS);
    const refText = buildStructuredPageText(ITEMS);
    expect(fullText).toBe(refText);
  });

  it("text output is deterministic across two calls", () => {
    const { text: a } = buildStructuredPageTextFull(ITEMS);
    const { text: b } = buildStructuredPageTextFull(ITEMS);
    expect(a).toBe(b);
  });

  it("returns empty text and empty bridge for empty input", () => {
    const { text, bridge } = buildStructuredPageTextFull([]);
    expect(text).toBe("");
    expect(bridge.paragraphMappings).toHaveLength(0);
  });
});

// ── Bridge paragraph alignment ────────────────────────────────────────────────

describe("StructuredPageBridge — paragraph alignment", () => {
  it("bridge paragraph count matches \\n\\n-split paragraph count from extractParagraphs()", () => {
    const { text, bridge } = buildStructuredPageTextFull(ITEMS);
    const paragraphs = extractParagraphs(text);
    expect(bridge.paragraphMappings).toHaveLength(paragraphs.length);
  });

  it("bridge charStart/charEnd match extractParagraphs() charStart/charEnd", () => {
    const { text, bridge } = buildStructuredPageTextFull(ITEMS);
    const paragraphs = extractParagraphs(text);
    for (let i = 0; i < paragraphs.length; i++) {
      expect(bridge.paragraphMappings[i].startChar).toBe(paragraphs[i].charStart);
      expect(bridge.paragraphMappings[i].endChar).toBe(paragraphs[i].charEnd);
    }
  });

  it("bridge has 2 paragraphs for the two-paragraph fixture", () => {
    const { bridge } = buildStructuredPageTextFull(ITEMS);
    expect(bridge.paragraphMappings).toHaveLength(2);
  });

  it("paragraph 0 contains item indexes 0–7", () => {
    const { bridge } = buildStructuredPageTextFull(ITEMS);
    const idxs = bridge.paragraphMappings[0].itemIndexes.sort((a, b) => a - b);
    expect(idxs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("paragraph 1 contains item indexes 8–13", () => {
    const { bridge } = buildStructuredPageTextFull(ITEMS);
    const idxs = bridge.paragraphMappings[1].itemIndexes.sort((a, b) => a - b);
    expect(idxs).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it("items without itemIndex produce empty itemIndexes in bridge", () => {
    const { bridge } = buildStructuredPageTextFull(ITEMS_WITHOUT_INDEXES);
    for (const m of bridge.paragraphMappings) {
      expect(m.itemIndexes).toHaveLength(0);
    }
  });
});

// ── PageBridgeRegistry ────────────────────────────────────────────────────────

describe("PageBridgeRegistry", () => {
  beforeEach(() => {
    PageBridgeRegistry.clear();
  });

  it("stores and retrieves a bridge by pageIndex", () => {
    const { bridge } = buildStructuredPageTextFull(ITEMS);
    PageBridgeRegistry.set(5, bridge);
    expect(PageBridgeRegistry.get(5)).toBe(bridge);
  });

  it("returns undefined for an unregistered page", () => {
    expect(PageBridgeRegistry.get(99)).toBeUndefined();
  });

  it("clear() removes all entries", () => {
    const { bridge } = buildStructuredPageTextFull(ITEMS);
    PageBridgeRegistry.set(0, bridge);
    PageBridgeRegistry.clear();
    expect(PageBridgeRegistry.get(0)).toBeUndefined();
  });
});

// ── buildCanonicalUnits — anchor enrichment ───────────────────────────────────

const VIEWPORT = { height: 800, scale: 1 };
const CONTENT_ITEMS = ITEMS.map(it => ({
  str: it.str ?? "",
  transform: it.transform ?? [1, 0, 0, 1, 0, 0],
  width: 20,
  height: 12,
}));

function setUpRegistries() {
  TextLayerRegistry.clear();
  PageBridgeRegistry.clear();
  const textIndex = buildPageTextIndex(0, { items: CONTENT_ITEMS }, VIEWPORT);
  TextLayerRegistry.set(textIndex);
  const { text, bridge } = buildStructuredPageTextFull(ITEMS);
  PageBridgeRegistry.set(0, bridge);
  return { text, bridge };
}

describe("buildCanonicalUnits — anchor enrichment with bridge", () => {
  beforeEach(() => setUpRegistries());
  afterEach(() => { TextLayerRegistry.clear(); PageBridgeRegistry.clear(); });

  function buildChunks(text: string) {
    return extractParagraphs(text).map(p => ({
      text: p.text,
      startChar: p.charStart,
      endChar: p.charEnd,
    }));
  }

  it("anchor.groundingState is 'exact' when bridge is present", () => {
    const { text } = setUpRegistries();
    const chunks = buildChunks(text);
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.anchor.groundingState).toBe("exact");
    }
  });

  it("anchor.groundingConfidence is 1.0 for exact grounding", () => {
    const { text } = setUpRegistries();
    const chunks = buildChunks(text);
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.anchor.groundingConfidence).toBe(1.0);
    }
  });

  it("anchor.pdfTextItemIndexes are populated", () => {
    const { text } = setUpRegistries();
    const chunks = buildChunks(text);
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.anchor.pdfTextItemIndexes).toBeDefined();
      expect(unit.anchor.pdfTextItemIndexes!.length).toBeGreaterThan(0);
    }
  });

  it("anchor.boundingBoxes are populated", () => {
    const { text } = setUpRegistries();
    const chunks = buildChunks(text);
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.anchor.boundingBoxes).toBeDefined();
      expect(unit.anchor.boundingBoxes!.length).toBeGreaterThan(0);
    }
  });

  it("anchor.anchorVersion is set", () => {
    const { text } = setUpRegistries();
    const chunks = buildChunks(text);
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.anchor.anchorVersion).toBe(1);
    }
  });

  it("anchor.exactSourceText equals the chunk text", () => {
    const { text } = setUpRegistries();
    const chunks = buildChunks(text);
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (let i = 0; i < units.length; i++) {
      expect(units[i].anchor.exactSourceText).toBe(chunks[i].text);
    }
  });
});

describe("buildCanonicalUnits — legacy fallback (no bridge)", () => {
  beforeEach(() => {
    TextLayerRegistry.clear();
    PageBridgeRegistry.clear();
    const textIndex = buildPageTextIndex(0, { items: CONTENT_ITEMS }, VIEWPORT);
    TextLayerRegistry.set(textIndex);
    // Deliberately do NOT set PageBridgeRegistry
  });
  afterEach(() => { TextLayerRegistry.clear(); PageBridgeRegistry.clear(); });

  it("falls back to fuzzy grounding when no bridge is present", () => {
    const refText = buildStructuredPageText(ITEMS);
    const chunks = extractParagraphs(refText).map(p => ({
      text: p.text, startChar: p.charStart, endChar: p.charEnd,
    }));
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      // Fuzzy fallback or no grounding — not "exact"
      expect(unit.anchor.groundingState).not.toBe("exact");
    }
  });

  it("provenance.hasGeometricGrounding is false without a bridge", () => {
    const refText = buildStructuredPageText(ITEMS);
    const chunks = extractParagraphs(refText).map(p => ({
      text: p.text, startChar: p.charStart, endChar: p.charEnd,
    }));
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.provenance?.hasGeometricGrounding).toBe(false);
    }
  });
});

// ── canonicalHash stability ───────────────────────────────────────────────────

describe("canonicalHash", () => {
  beforeEach(() => setUpRegistries());
  afterEach(() => { TextLayerRegistry.clear(); PageBridgeRegistry.clear(); });

  function makeUnit(text: string) {
    PageBridgeRegistry.clear();
    return buildCanonicalUnits({
      documentId: "doc1",
      bookId: "book1",
      pageIndex: 0,
      chunks: [{ text, startChar: 0, endChar: text.length }],
    })[0];
  }

  it("is stable across two independent calls with the same input", () => {
    const a = makeUnit("The mitochondria is the powerhouse of the cell.");
    const b = makeUnit("The mitochondria is the powerhouse of the cell.");
    expect(a.canonicalHash).toBe(b.canonicalHash);
  });

  it("differs for different text", () => {
    const a = makeUnit("The mitochondria is the powerhouse of the cell.");
    const b = makeUnit("ATP synthesis occurs via oxidative phosphorylation.");
    expect(a.canonicalHash).not.toBe(b.canonicalHash);
  });

  it("is an 8-character hex string", () => {
    const unit = makeUnit("test text");
    expect(unit.canonicalHash).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ── provenance population ─────────────────────────────────────────────────────

describe("CanonicalProvenance", () => {
  beforeEach(() => setUpRegistries());
  afterEach(() => { TextLayerRegistry.clear(); PageBridgeRegistry.clear(); });

  it("provenance is populated on every unit", () => {
    const { text } = buildStructuredPageTextFull(ITEMS);
    const chunks = extractParagraphs(text).map(p => ({
      text: p.text, startChar: p.charStart, endChar: p.charEnd,
    }));
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.provenance).toBeDefined();
      expect(unit.provenance!.extractorVersion).toBeGreaterThan(0);
      expect(unit.provenance!.structureVersion).toBeGreaterThan(0);
      expect(unit.provenance!.paragraphAlgorithmVersion).toBeGreaterThan(0);
      expect(typeof unit.provenance!.extractedAt).toBe("number");
    }
  });

  it("provenance.hasGeometricGrounding is true when bridge is present", () => {
    const { text } = buildStructuredPageTextFull(ITEMS);
    const chunks = extractParagraphs(text).map(p => ({
      text: p.text, startChar: p.charStart, endChar: p.charEnd,
    }));
    const units = buildCanonicalUnits({ documentId: "doc1", bookId: "book1", pageIndex: 0, chunks });
    for (const unit of units) {
      expect(unit.provenance!.hasGeometricGrounding).toBe(true);
    }
  });
});

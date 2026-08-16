// tests/pdf/orderItemsForReading.test.ts
// Stabilization item 3 — the shared reading-order function both
// buildStructuredPageText/buildStructuredPageTextFull (builds/verifies
// quotes) and buildPageTextIndex (locates their geometry) now consume, so
// the two can no longer disagree on item order the way they could before
// (buildPageTextIndex previously walked raw textContent.items array order,
// not reading order).

import { orderItemsForReading, buildStructuredPageText } from "../../lib/pdf/structuredPageText";
import { buildPageTextIndex } from "../../lib/page-intelligence/textLayerIndex";

describe("orderItemsForReading — single column", () => {
  it("sorts top-to-bottom, left-to-right", () => {
    const items = [
      { str: "world", transform: [1, 0, 0, 1, 50, 738] }, // line 2
      { str: "hello", transform: [1, 0, 0, 1, 10, 750] }, // line 1, word 1
      { str: "there", transform: [1, 0, 0, 1, 60, 750] }, // line 1, word 2
    ];
    const { items: ordered, hasColumnSplit } = orderItemsForReading(items);
    expect(hasColumnSplit).toBe(false);
    expect(ordered.map(i => i.str)).toEqual(["hello", "there", "world"]);
  });

  it("preserves order for an already-correctly-ordered single-column fixture (no-op)", () => {
    const items = [
      { str: "A", transform: [1, 0, 0, 1, 50, 750] },
      { str: "B", transform: [1, 0, 0, 1, 50, 738] },
      { str: "C", transform: [1, 0, 0, 1, 50, 726] },
    ];
    const { items: ordered } = orderItemsForReading(items);
    expect(ordered.map(i => i.str)).toEqual(["A", "B", "C"]);
  });

  it("filters out empty/whitespace-only items", () => {
    const items = [
      { str: "real", transform: [1, 0, 0, 1, 0, 100] },
      { str: "", transform: [1, 0, 0, 1, 10, 100] },
      { str: "   ", transform: [1, 0, 0, 1, 20, 100] },
    ];
    const { items: ordered } = orderItemsForReading(items);
    expect(ordered.map(i => i.str)).toEqual(["real"]);
  });

  it("returns empty result for an all-empty input", () => {
    const { items, columnBoundary, hasColumnSplit } = orderItemsForReading([]);
    expect(items).toEqual([]);
    expect(columnBoundary).toBe(0);
    expect(hasColumnSplit).toBe(false);
  });
});

describe("orderItemsForReading — two-column layout", () => {
  // A genuine two-column textbook page: PDF.js's own item array order does
  // NOT already match visual reading order — rows from both columns are
  // interleaved in the source content stream, which is what buildPageTextIndex
  // used to trust blindly before this fix. detectColumnSplit requires at
  // least 10 items, so this fixture pads each column to 5 rows.
  const TWO_COLUMN_INTERLEAVED = [
    { str: "Left1",  transform: [1, 0, 0, 1, 50,  750] },
    { str: "Right1", transform: [1, 0, 0, 1, 350, 750] }, // same row, right column — emitted right after Left1
    { str: "Left2",  transform: [1, 0, 0, 1, 50,  738] },
    { str: "Right2", transform: [1, 0, 0, 1, 350, 738] },
    { str: "Left3",  transform: [1, 0, 0, 1, 50,  726] },
    { str: "Right3", transform: [1, 0, 0, 1, 350, 726] },
    { str: "Left4",  transform: [1, 0, 0, 1, 50,  714] },
    { str: "Right4", transform: [1, 0, 0, 1, 350, 714] },
    { str: "Left5",  transform: [1, 0, 0, 1, 50,  702] },
    { str: "Right5", transform: [1, 0, 0, 1, 350, 702] },
  ];

  it("REQUIRED: detects the column split and orders left column fully before right column", () => {
    const { items: ordered, columnBoundary, hasColumnSplit } = orderItemsForReading(TWO_COLUMN_INTERLEAVED);
    expect(hasColumnSplit).toBe(true);
    expect(ordered.slice(0, columnBoundary).map(i => i.str)).toEqual(["Left1", "Left2", "Left3", "Left4", "Left5"]);
    expect(ordered.slice(columnBoundary).map(i => i.str)).toEqual(["Right1", "Right2", "Right3", "Right4", "Right5"]);
  });

  it("REQUIRED: buildPageTextIndex's fullText now matches buildStructuredPageText's reading order on the SAME two-column input — the actual bug fix", () => {
    // Before this fix, buildPageTextIndex walked raw item-array order
    // ("Left1 Right1 Left2 Right2...") while buildStructuredPageText walked
    // reading order ("Left1 Left2 Left3 Right1 Right2 Right3") — a quote
    // built from the latter could fail to resolve, or resolve to the wrong
    // position, when located against the former.
    const withIndexes = TWO_COLUMN_INTERLEAVED.map((it, i) => ({ ...it, itemIndex: i }));
    const structuredText = buildStructuredPageText(withIndexes);
    const index = buildPageTextIndex(0, { items: TWO_COLUMN_INTERLEAVED.map(it => ({ ...it, width: 40, height: 12 })) });

    // Both reconstructions must agree that "Left3" precedes "Right1" — true
    // reading order, never true of raw PDF.js item-array order for this fixture.
    const structuredLeft3Pos = structuredText.indexOf("Left3");
    const structuredRight1Pos = structuredText.indexOf("Right1");
    const indexLeft3Pos = index.fullText.indexOf("Left3");
    const indexRight1Pos = index.fullText.indexOf("Right1");

    expect(structuredLeft3Pos).toBeLessThan(structuredRight1Pos);
    expect(indexLeft3Pos).toBeLessThan(indexRight1Pos);
  });

  it("REQUIRED: buildPageTextIndex token itemIndex values refer to ORIGINAL array position, not reading-order position", () => {
    const index = buildPageTextIndex(0, {
      items: TWO_COLUMN_INTERLEAVED.map(it => ({ ...it, width: 40, height: 12 })),
    });
    // "Left3" is at original array index 4; after reordering it's the 3rd
    // token visited (reading order), but its itemIndex must still be 4.
    const left3Token = index.tokens.find(t => t.str === "Left3");
    expect(left3Token?.itemIndex).toBe(4);
    const right1Token = index.tokens.find(t => t.str === "Right1");
    expect(right1Token?.itemIndex).toBe(1);
  });
});

describe("orderItemsForReading — realistic layout fixtures", () => {
  it("wrapped multi-line sentence stays in sequential order within its column", () => {
    const items = [
      { str: "The",  transform: [1, 0, 0, 1, 50, 700] },
      { str: "quick", transform: [1, 0, 0, 1, 75, 700] },
      { str: "brown", transform: [1, 0, 0, 1, 110, 700] },
      { str: "fox",   transform: [1, 0, 0, 1, 50, 688] },
      { str: "jumps", transform: [1, 0, 0, 1, 70, 688] },
    ];
    const { items: ordered } = orderItemsForReading(items);
    expect(ordered.map(i => i.str)).toEqual(["The", "quick", "brown", "fox", "jumps"]);
  });

  it("hyphenated line break — items stay in order (buildColumnFull merges the hyphen, ordering just visits them in sequence)", () => {
    const items = [
      { str: "sec-",  transform: [1, 0, 0, 1, 0, 100] },
      { str: "tion",  transform: [1, 0, 0, 1, 0, 88] },
      { str: "two",   transform: [1, 0, 0, 1, 25, 88] },
    ];
    const { items: ordered } = orderItemsForReading(items);
    expect(ordered.map(i => i.str)).toEqual(["sec-", "tion", "two"]);
  });

  it("heading followed by instructional body orders the heading first", () => {
    const heading = { str: "Cell Structure", transform: [1, 0, 0, 1, 50, 760] };
    const body = { str: "Mitochondria produce ATP.", transform: [1, 0, 0, 1, 50, 740] };
    const { items: ordered } = orderItemsForReading([body, heading]);
    expect(ordered.map(i => i.str)).toEqual(["Cell Structure", "Mitochondria produce ATP."]);
  });

  it("a TOC-like row layout (chapter title ... page number, one row per line) preserves row order top-to-bottom", () => {
    const items = [
      { str: "Chapter 1: Cells",    transform: [1, 0, 0, 1, 50, 700] },
      { str: "1",                   transform: [1, 0, 0, 1, 500, 700] },
      { str: "Chapter 2: Genetics", transform: [1, 0, 0, 1, 50, 688] },
      { str: "34",                  transform: [1, 0, 0, 1, 500, 688] },
    ];
    const { items: ordered } = orderItemsForReading(items);
    expect(ordered.map(i => i.str)).toEqual(["Chapter 1: Cells", "1", "Chapter 2: Genetics", "34"]);
  });

  it("a title/front-matter page with a single centered block does not crash and orders top-to-bottom", () => {
    const items = [
      { str: "PRINCIPLES", transform: [1, 0, 0, 1, 200, 700] },
      { str: "OF",         transform: [1, 0, 0, 1, 200, 680] },
      { str: "BIOLOGY",    transform: [1, 0, 0, 1, 200, 660] },
    ];
    const { items: ordered, hasColumnSplit } = orderItemsForReading(items);
    expect(hasColumnSplit).toBe(false);
    expect(ordered.map(i => i.str)).toEqual(["PRINCIPLES", "OF", "BIOLOGY"]);
  });

  it("header/footer contamination (running header glued above body) preserves reading order — content classification is a later phase, this only verifies ordering", () => {
    const items = [
      { str: "30 UNIT ONE The Chemistry of Life", transform: [1, 0, 0, 1, 50, 760] },
      { str: "Cells are the basic unit of life.",  transform: [1, 0, 0, 1, 50, 740] },
    ];
    const { items: ordered } = orderItemsForReading(items);
    expect(ordered.map(i => i.str)).toEqual([
      "30 UNIT ONE The Chemistry of Life",
      "Cells are the basic unit of life.",
    ]);
  });
});

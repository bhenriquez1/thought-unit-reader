// tests/pdf/textLayerIndexCanonicalText.test.ts
// Stabilization item 4C-2 — closes the confirmed divergence a live survey
// found: buildPageTextIndex (backs eye-follow's resolveWordGeometry AND
// Highlight's Strategy 2/3 geometry search) previously assembled its own
// fullText via a flat single-space join — never inserting paragraph breaks,
// never merging hyphenated line-wraps, never separating two-column text
// with "\n\n" — while Highlight/Current Page speech/CanonicalPageMap all
// build their text from buildStructuredPageText(Full). The two were only
// guaranteed to agree on item ORDERING (item 3's fix), not on the actual
// text bytes. These tests prove byte-identity is now structural.

import { buildPageTextIndex } from "../../lib/page-intelligence/textLayerIndex";
import { buildStructuredPageTextFull, locateItemOffsetsInText, orderItemsForReading } from "../../lib/pdf/structuredPageText";

function item(str: string, x: number, y: number, width = str.length * 7, height = 12) {
  return { str, transform: [1, 0, 0, 1, x, y], width, height };
}

describe("locateItemOffsetsInText — the sequential forward-search core (item 4C-2)", () => {
  it("locates each item's exact range in text built from those SAME items", () => {
    const rawItems = [
      item("First sentence here for the test.", 50, 700),
      item("Second sentence follows right after.", 50, 686),
    ].map((it, i) => ({ ...it, itemIndex: i }));
    const { items: ordered } = orderItemsForReading(rawItems);
    const { text } = buildStructuredPageTextFull(rawItems);
    const offsets = locateItemOffsetsInText(text, ordered);
    expect(offsets).toHaveLength(2);
    for (const { itemIndex, start, end } of offsets) {
      const original = rawItems.find(it => it.itemIndex === itemIndex)!;
      expect(text.slice(start, end)).toBe(original.str);
    }
  });

  it("REQUIRED: locates a hyphen-merged item without its trailing hyphen (which the merge stripped), and the following item immediately after with no gap", () => {
    const rawItems = [
      item("The professor gave a challenging exam-", 50, 700),
      item("ple of a well-designed multi-step problem.", 50, 686),
    ].map((it, i) => ({ ...it, itemIndex: i }));
    const { items: ordered } = orderItemsForReading(rawItems);
    const { text } = buildStructuredPageTextFull(rawItems);
    const offsets = locateItemOffsetsInText(text, ordered);
    expect(offsets).toHaveLength(2);
    const first = offsets.find(o => o.itemIndex === 0)!;
    const second = offsets.find(o => o.itemIndex === 1)!;
    expect(text.slice(first.start, first.end)).toBe("The professor gave a challenging exam"); // no trailing hyphen
    expect(second.start).toBe(first.end); // glued with no gap
    expect(text.slice(second.start, second.end)).toBe("ple of a well-designed multi-step problem.");
  });

  it("offsets advance monotonically in reading order — never search backward past an already-consumed position", () => {
    const rawItems = [
      item("Alpha beta gamma delta epsilon here.", 50, 700),
      item("Alpha beta gamma delta epsilon repeats.", 50, 686),
    ].map((it, i) => ({ ...it, itemIndex: i }));
    const { items: ordered } = orderItemsForReading(rawItems);
    const { text } = buildStructuredPageTextFull(rawItems);
    const offsets = locateItemOffsetsInText(text, ordered);
    expect(offsets).toHaveLength(2);
    expect(offsets[1].start).toBeGreaterThanOrEqual(offsets[0].end);
  });

  it("returns [] for no items", () => {
    expect(locateItemOffsetsInText("", [])).toEqual([]);
  });
});

describe("buildPageTextIndex — fullText is byte-identical to buildStructuredPageTextFull's output (item 4C-2)", () => {
  it("REQUIRED: single-column multi-line text — identical, including no artificial spacing differences", () => {
    const items = [
      item("The mitochondria produce ATP through respiration.", 50, 700),
      item("Ribosomes synthesize proteins from mRNA templates.", 50, 686),
      item("Both processes are essential for cellular function.", 50, 672),
    ];
    const { text: canonical } = buildStructuredPageTextFull(items.map((it, i) => ({ ...it, itemIndex: i })));
    const index = buildPageTextIndex(0, { items });
    expect(index.fullText).toBe(canonical);
  });

  it("REQUIRED: a paragraph break (large Y gap) inserts '\\n\\n' in fullText — the old flat join never did this", () => {
    // Three same-paragraph lines at a consistent ~14pt gap first, so the
    // median-gap calculation reflects the real single-line spacing before
    // the one large (66pt) gap that should register as a paragraph break.
    const items = [
      item("First paragraph opening sentence here for the test.", 50, 700),
      item("First paragraph continues on this second line too.", 50, 686),
      item("First paragraph has a third line for good measure.", 50, 672),
      // Large gap relative to the ~14pt line spacing above -> paragraph break.
      item("Second paragraph begins after a real section gap.", 50, 606),
    ];
    const { text: canonical } = buildStructuredPageTextFull(items.map((it, i) => ({ ...it, itemIndex: i })));
    const index = buildPageTextIndex(0, { items });
    expect(canonical).toContain("\n\n");
    expect(index.fullText).toBe(canonical);
  });

  it("REQUIRED: a hyphenated line-wrap merges into one word — the old flat join left 'exam- ple' with a stray space and hyphen", () => {
    const items = [
      item("The professor gave a challenging exam-", 50, 700),
      item("ple of a well-designed multi-step problem.", 50, 686),
    ];
    const { text: canonical } = buildStructuredPageTextFull(items.map((it, i) => ({ ...it, itemIndex: i })));
    const index = buildPageTextIndex(0, { items });
    expect(canonical).toContain("example");
    expect(canonical).not.toContain("exam- ple");
    expect(index.fullText).toBe(canonical);
  });

  it("REQUIRED: two-column layout separates columns with '\\n\\n' in fullText — the old flat join concatenated both columns with plain spaces, no separator at all", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => item(`Left${i} column sentence content here.`, 60, 700 - i * 20)),
      ...Array.from({ length: 5 }, (_, i) => item(`Right${i} column sentence content here.`, 340, 700 - i * 20)),
    ];
    const { text: canonical } = buildStructuredPageTextFull(items.map((it, i) => ({ ...it, itemIndex: i })));
    const index = buildPageTextIndex(0, { items });
    expect(canonical).toContain("\n\n");
    expect(index.fullText).toBe(canonical);
    // The two-column ordering fix (item 3) still holds: left column fully
    // before right column.
    expect(index.fullText.indexOf("Left4")).toBeLessThan(index.fullText.indexOf("Right0"));
  });

  it("REQUIRED: every token's startChar/endChar is an exact substring match into the (now-canonical) fullText", () => {
    const items = [
      item("The mitochondria produce ATP through respiration.", 50, 700),
      item("Ribosomes synthesize proteins from mRNA templates.", 50, 686),
    ];
    const index = buildPageTextIndex(0, { items });
    expect(index.tokens.length).toBeGreaterThan(0);
    for (const token of index.tokens) {
      expect(index.fullText.slice(token.startChar, token.endChar)).toBe(token.str);
    }
  });

  it("REQUIRED: every item still produces exactly one token, in the common case — the per-item offset search does not silently drop items for ordinary text", () => {
    const items = [
      item("The mitochondria produce ATP through respiration.", 50, 700),
      item("Ribosomes synthesize proteins from mRNA templates.", 50, 686),
      item("A third line follows immediately after that one.", 50, 672),
    ];
    const index = buildPageTextIndex(0, { items });
    expect(index.tokens).toHaveLength(3);
    expect(index.tokens.map(t => t.itemIndex)).toEqual([0, 1, 2]);
  });

  it("itemIndex still refers to the ORIGINAL textContent.items array position, not reading order — unchanged contract for Strategy 1 lookups elsewhere", () => {
    // Right-column item appears FIRST in the raw array (index 0) but reads
    // SECOND (after the left column) — itemIndex must still say 0.
    const items = [
      item("Right0 column sentence appearing first in the raw array.", 340, 700),
      item("Left0 column sentence appearing second in the raw array.", 60, 700),
      ...Array.from({ length: 8 }, (_, i) => item(`Filler${i} to cross the column-detection item-count floor.`, i % 2 === 0 ? 60 : 340, 680 - i * 15)),
    ];
    const index = buildPageTextIndex(0, { items });
    const rightToken = index.tokens.find(t => t.str.startsWith("Right0"));
    expect(rightToken?.itemIndex).toBe(0);
    const leftToken = index.tokens.find(t => t.str.startsWith("Left0"));
    expect(leftToken?.itemIndex).toBe(1);
  });
});

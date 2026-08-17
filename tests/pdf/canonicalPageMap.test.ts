// tests/pdf/canonicalPageMap.test.ts
// Stabilization item 4C-1 — Canonical Page Map foundation. Pure-function
// tests for buildCanonicalPageMap plus the registry's epoch-guard contract
// (mirroring PageBridgeRegistry/TextLayerRegistry — see
// tests/pdf/extractionRegistryEpoch.test.ts for the cross-document race
// this pattern closes).

import {
  buildCanonicalPageMap,
  CanonicalPageMapRegistry,
  CANONICAL_PAGE_MAP_VERSION,
} from "../../lib/pdf/canonicalPageMap";

describe("buildCanonicalPageMap — enumeration and offsets", () => {
  it("returns [] sentences for empty/whitespace-only text, but still a well-formed map", () => {
    const map = buildCanonicalPageMap(0, "");
    expect(map.sentences).toEqual([]);
    expect(map.pageIndex).toBe(0);
    expect(map.fullText).toBe("");
    expect(map.structureVersion).toBe(CANONICAL_PAGE_MAP_VERSION);
  });

  it("assigns ordinal ids in reading order", () => {
    const text = "The cell is the basic unit of life. Mitochondria produce ATP through respiration. Ribosomes synthesize proteins.";
    const map = buildCanonicalPageMap(0, text);
    expect(map.sentences.map(s => s.id)).toEqual(["S001", "S002", "S003"]);
  });

  it("REQUIRED: every sentence's charStart/charEnd is an exact offset into fullText — fullText.slice(charStart, charEnd) === text always holds", () => {
    const text = "First sentence here for the test. Second sentence follows right after that one. Third one too.";
    const map = buildCanonicalPageMap(0, text);
    expect(map.sentences.length).toBeGreaterThan(0);
    for (const s of map.sentences) {
      expect(map.fullText.slice(s.charStart, s.charEnd)).toBe(s.text);
    }
  });

  it("REQUIRED: retains non-body spans (does not silently drop them like segmentPageSentences does) — a chapter header sentence still gets an entry, tagged (not omitted)", () => {
    const text = "CHAPTER 4 Acid-Base Equilibrium\n\nBuffer solutions resist changes in pH through a weak acid and its conjugate base.";
    const map = buildCanonicalPageMap(0, text);
    // segmentPageSentences would OMIT this line entirely (isLikelyHeaderLine
    // rejects it); the canonical map instead retains it, tagged 'heading'
    // (a chapter/unit keyword header — more specific than the generic
    // page-furniture bucket, which is bare page numbers/copyright/footers).
    const headerSentence = map.sentences.find(s => s.text.startsWith("CHAPTER 4"));
    expect(headerSentence).toBeDefined();
    expect(headerSentence!.regionRole).toBe("heading");
    const bodySentence = map.sentences.find(s => s.text.includes("Buffer solutions resist"));
    expect(bodySentence).toBeDefined();
    expect(bodySentence!.regionRole).toBe("body");
  });

  it("REQUIRED: a figure caption is retained and tagged figure-table-caption, not dropped and not conflated with body", () => {
    // A single-digit figure number, deliberately avoiding a decimal point
    // ("Figure 3.2") — the shared sentence-boundary finder (inherited
    // unchanged from segmentPageSentences.ts) splits on ANY period,
    // including one embedded in a decimal figure number, so "Figure 3.2 ..."
    // fragments into "Figure 3." + "2 ...". That's a pre-existing
    // characteristic of the shared boundary algorithm, not something this
    // PR changes — see the known-limitations note in the PR description.
    const text = "The cell membrane regulates transport. Figure 4 The ATP synthase complex spans the membrane. Transport continues below.";
    const map = buildCanonicalPageMap(0, text);
    const captionSentence = map.sentences.find(s => s.text.startsWith("Figure 4"));
    expect(captionSentence).toBeDefined();
    expect(captionSentence!.regionRole).toBe("figure-table-caption");
  });

  it("KNOWN LIMITATION: a decimal-numbered figure caption fragments at the embedded period — documented, not silently wrong", () => {
    const text = "Figure 3.2 The ATP synthase complex spans the membrane.";
    const map = buildCanonicalPageMap(0, text);
    expect(map.sentences.map(s => s.text)).toEqual([
      "Figure 3.",
      "2 The ATP synthase complex spans the membrane.",
    ]);
  });

  it("tags every sentence's pageIndex to match the page passed in", () => {
    const map = buildCanonicalPageMap(4, "A real sentence long enough to count as a body span here.");
    expect(map.sentences.every(s => s.pageIndex === 4)).toBe(true);
  });

  it("is a pure function — the same pageText always produces an identical map", () => {
    const text = "Sentence one goes here for the test. Sentence two goes here as well for good measure.";
    const a = buildCanonicalPageMap(2, text);
    const b = buildCanonicalPageMap(2, text);
    expect(a).toEqual(b);
  });

  it("does not cross a paragraph break into the next block, same as findSentenceSpans/segmentPageSentences", () => {
    const text = "First paragraph sentence with enough length to pass the floor.\n\nSecond paragraph sentence also long enough.";
    const map = buildCanonicalPageMap(0, text);
    expect(map.sentences).toHaveLength(2);
    expect(map.sentences[0].text).not.toContain("Second paragraph");
  });
});

describe("CanonicalPageMapRegistry — epoch-guarded writes (same contract as PageBridgeRegistry/TextLayerRegistry)", () => {
  it("clear() returns a new, higher epoch each call", () => {
    const a = CanonicalPageMapRegistry.clear();
    const b = CanonicalPageMapRegistry.clear();
    expect(b).toBeGreaterThan(a);
    expect(CanonicalPageMapRegistry.currentEpoch()).toBe(b);
  });

  it("a set() stamped with the CURRENT epoch is applied", () => {
    const epoch = CanonicalPageMapRegistry.clear();
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(0, "A real sentence long enough to count here."), epoch);
    expect(CanonicalPageMapRegistry.get(0)).toBeDefined();
  });

  it("REQUIRED: a set() stamped with a SUPERSEDED epoch is silently dropped — the rapid document-switch reproducer", () => {
    const staleEpoch = CanonicalPageMapRegistry.clear(); // "extraction A" starts
    CanonicalPageMapRegistry.clear(); // "extraction B" starts before A's write lands
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(3, "A real sentence long enough to count here."), staleEpoch);
    expect(CanonicalPageMapRegistry.get(3)).toBeUndefined();
  });

  it("a set() with no forEpoch argument is never rejected", () => {
    CanonicalPageMapRegistry.clear();
    CanonicalPageMapRegistry.set(buildCanonicalPageMap(7, "A real sentence long enough to count here."));
    expect(CanonicalPageMapRegistry.get(7)).toBeDefined();
  });

  it("get() returns undefined for a page never set", () => {
    CanonicalPageMapRegistry.clear();
    expect(CanonicalPageMapRegistry.get(999)).toBeUndefined();
  });
});

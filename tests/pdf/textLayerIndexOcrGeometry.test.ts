// tests/pdf/textLayerIndexOcrGeometry.test.ts
// R5 — an OCR'd page has no PDF.js text-layer items at all (a scanned
// page's textContent.items is empty), so TextLayerRegistry previously had
// nothing to store for it: every highlight/eye-guide geometry lookup on
// such a page silently resolved to nothing, even after the page's TEXT was
// correctly OCR'd (R1's OCR-corruption-routing fix gets the text right but
// does nothing for geometry). Feasibility investigation found tesseract.js
// already computes a word-level bbox for every recognized word — it just
// needed to be requested (`{ blocks: true }`, see extractPageText.test.ts's
// R5 tests) and converted into the same PageTextIndex shape
// resolveAnchorGeometry.ts/resolveWordGeometry already consume.
//
// buildPageTextIndexFromOCR is the conversion: this file proves its two
// real responsibilities as pure behavior — (1) the pixel→viewport-space-at-
// scale-1 coordinate conversion (a scalar divide by the OCR render scale,
// per resolveAnchorGeometry.ts's own documented convention that viewport
// space is linear in scale for a fixed rotation), and (2) recovering each
// word's char offset within the CANONICAL page text via the same
// locateItemOffsetsInText forward-search utility buildPageTextIndex already
// relies on for native PDF items — never a hand-rebuilt join that could
// drift from the text everything else searches against.

import { buildPageTextIndexFromOCR } from "../../lib/page-intelligence/textLayerIndex";
import type { OCRWordBox } from "../../lib/page-intelligence/types";

function word(text: string, x0: number, y0: number, x1: number, y1: number): OCRWordBox {
  return { text, bbox: { x0, y0, x1, y1 } };
}

describe("buildPageTextIndexFromOCR — coordinate conversion", () => {
  it("REQUIRED: divides pixel bbox coordinates by the OCR render scale to land in TextLayerRegistry's scale=1 viewport-space convention", () => {
    const words = [word("Ethanol", 20, 40, 120, 68)];
    const index = buildPageTextIndexFromOCR(0, words, 2.0, "Ethanol reacts with oxygen.");
    expect(index.tokens).toHaveLength(1);
    expect(index.tokens[0].bbox).toEqual({ x: 10, y: 20, w: 50, h: 14 });
  });

  it("a different render scale (e.g. a higher-DPI OCR capture) divides by that scale instead — the conversion is not hardcoded to 2.0", () => {
    const words = [word("Ethanol", 40, 80, 240, 136)];
    const index = buildPageTextIndexFromOCR(0, words, 4.0, "Ethanol reacts with oxygen.");
    expect(index.tokens[0].bbox).toEqual({ x: 10, y: 20, w: 50, h: 14 });
  });

  it("multiple words each convert independently and stay in reading order", () => {
    const words = [
      word("Ethanol", 20, 40, 120, 68),
      word("reacts", 130, 40, 200, 68),
      word("with", 210, 40, 260, 68),
      word("oxygen.", 270, 40, 360, 68),
    ];
    const index = buildPageTextIndexFromOCR(0, words, 2.0, "Ethanol reacts with oxygen.");
    expect(index.tokens.map(t => t.str)).toEqual(["Ethanol", "reacts", "with", "oxygen."]);
    expect(index.tokens.map(t => t.bbox.x)).toEqual([10, 65, 105, 135]);
  });
});

describe("buildPageTextIndexFromOCR — char offsets recovered from the CANONICAL page text", () => {
  it("REQUIRED: fullText is set to the canonical page text verbatim, not rebuilt from the word list — the same discipline buildPageTextIndex's own header comment documents for native items, so a quote search against this index's fullText matches what the rest of the app searched to find that quote in the first place", () => {
    const canonicalText = "Ethanol reacts with oxygen to produce acetic acid.";
    const words = [word("Ethanol", 20, 40, 120, 68), word("reacts", 130, 40, 200, 68)];
    const index = buildPageTextIndexFromOCR(0, words, 2.0, canonicalText);
    expect(index.fullText).toBe(canonicalText);
  });

  it("REQUIRED: each token's startChar/endChar are its real offsets within the canonical text, found via sequential forward search", () => {
    const canonicalText = "Ethanol reacts with oxygen.";
    const words = [
      word("Ethanol", 0, 0, 10, 10),
      word("reacts", 0, 0, 10, 10),
      word("with", 0, 0, 10, 10),
      word("oxygen.", 0, 0, 10, 10),
    ];
    const index = buildPageTextIndexFromOCR(0, words, 1.0, canonicalText);
    const spans = index.tokens.map(t => canonicalText.slice(t.startChar, t.endChar));
    expect(spans).toEqual(["Ethanol", "reacts", "with", "oxygen."]);
  });

  it("a word that cannot be located in the canonical text (never happens for real Tesseract output, but stay defensive) is simply omitted, never guessed at — same rule resolveAnchorGeometry.ts documents elsewhere", () => {
    const canonicalText = "Ethanol reacts with oxygen.";
    const words = [
      word("Ethanol", 0, 0, 10, 10),
      word("NOT_IN_TEXT", 0, 0, 10, 10),
      word("with", 0, 0, 10, 10),
    ];
    const index = buildPageTextIndexFromOCR(0, words, 1.0, canonicalText);
    expect(index.tokens.map(t => t.str)).toEqual(["Ethanol", "with"]);
  });
});

describe("buildPageTextIndexFromOCR — degenerate inputs", () => {
  it("no OCR words returns an empty-token index carrying the canonical text, not a crash", () => {
    const index = buildPageTextIndexFromOCR(3, [], 2.0, "Some page text.");
    expect(index).toEqual({ pageIndex: 3, fullText: "Some page text.", tokens: [] });
  });

  it("a zero/undefined render scale returns an empty-token index rather than dividing by zero into Infinity/NaN bboxes", () => {
    const words = [word("Ethanol", 20, 40, 120, 68)];
    const index = buildPageTextIndexFromOCR(0, words, 0, "Ethanol reacts.");
    expect(index.tokens).toEqual([]);
  });

  it("preserves the requested pageIndex on the returned index", () => {
    const index = buildPageTextIndexFromOCR(7, [], 2.0, "text");
    expect(index.pageIndex).toBe(7);
  });
});

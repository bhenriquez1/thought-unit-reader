// tests/pdf/sentenceFocusCanonicalGeometry.test.ts
// Stabilization fix — unify eye-follow auto-scroll with canonical PDF geometry.
//
// Root cause: focusSnippet (the sentence-level auto-scroll/highlight driven
// by Current Page speech, via StudySpeechPanel's onSnippetFocus) resolved
// its target through findSpanForSnippet — an independent DOM `.textLayer
// span` query with its own token-overlap scoring that ACCEPTED a match at a
// score as low as 0.45, entirely separate from resolveTargetGeometry (the
// canonical TextLayerRegistry-backed resolver highlights and the word
// marker already share). Target architecture:
//   SOURCE_VERBATIM sentenceId -> canonical source geometry -> word marker
//   -> sentence focus -> auto-scroll
// No independent fuzzy-match system should decide a different location, and
// resolution failure must never jump the viewport to a guessed sentence.
//
// No jsdom/render harness in this repo (testEnvironment: "node"), so the
// wiring assertions below follow the established source-inspection pattern;
// resolveTargetGeometry's own resolution/verification logic already has
// real behavioral test coverage in tests/pdf/resolveAnchorGeometry.test.ts
// (imported and exercised directly below to prove the "no low-confidence
// fallback" and "graceful failure" claims against the actual function, not
// just against its source text).

import fs from "fs";
import path from "path";
import { resolveTargetGeometry } from "../../lib/pdf/resolveAnchorGeometry";
import { TextLayerRegistry } from "../../lib/page-intelligence/textLayerIndex";

const VIEWER_FILE = path.resolve(__dirname, "../../components/SmartPDFViewer.tsx");

describe("SmartPDFViewer.tsx — focusSnippet resolves via the canonical resolver, not an independent fuzzy matcher", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: the old independent fuzzy DOM-span matcher is gone — no findSpanForSnippet, no 0.45 score threshold", () => {
    expect(src).not.toMatch(/findSpanForSnippet/);
    expect(src).not.toMatch(/bestScore >= 0\.45/);
    expect(src).not.toMatch(/function stripPunctForMatch/);
  });

  it("REQUIRED: the focusSnippet effect calls resolveTargetGeometry — the SAME resolver highlights (resolveTargetGeometry) and the word marker (resolveWordGeometry) already use, both imported from lib/pdf/resolveAnchorGeometry", () => {
    expect(src).toMatch(/import \{ resolveTargetGeometry, resolveWordGeometry \} from "@\/lib\/pdf\/resolveAnchorGeometry";/);
    const idx = src.indexOf("if (!focusSnippet || focusSnippet.trim().length < 8)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/resolveTargetGeometry\(currentPage - 1, focusSnippet, effectiveZoom\)/);
  });

  it("REQUIRED: graceful failure — when resolution produces zero rects, the marker/scroll state is cleared, never a fallback guess", () => {
    const idx = src.indexOf("if (!focusSnippet || focusSnippet.trim().length < 8)");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/if \(rects\.length === 0\) \{ setSentenceFocusRect\(null\); return; \}/);
  });

  it("REQUIRED: auto-scroll (scrollIntoView) only fires through the resolved marker's own visibility check, not unconditionally on every resolution", () => {
    const idx = src.indexOf("if (!sentenceFocusRect) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/if \(!isFullyVisibleInContainer\(marker, container\)\) \{/);
    expect(block).toMatch(/marker\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\);/);
  });

  it("the marker element renders at the resolved rect's exact coordinates, in the same coordinate space WordRectOverlay's own marker uses", () => {
    const idx = src.indexOf("{sentenceFocusRect && (");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/ref=\{sentenceFocusMarkerRef\}/);
    expect(block).toMatch(/top: sentenceFocusRect\.top,/);
    expect(block).toMatch(/left: sentenceFocusRect\.left,/);
  });
});

describe("resolveTargetGeometry — real behavioral proof of graceful failure vs. a low-confidence fuzzy match (the exact function focusSnippet now calls)", () => {
  const PAGE_INDEX = 9001; // isolated fixture page index, never collides with other suites

  beforeEach(() => TextLayerRegistry.clear());
  afterEach(() => TextLayerRegistry.clear());

  function seedRegistry(fullText: string) {
    // Minimal single-token-spanning-fullText registry: resolveTargetGeometry's
    // Strategy 3 gate (verifyFullQuoteMatch) operates on the fullText string
    // directly, independent of token granularity — one token covering the
    // whole text is enough to prove the success/failure boundary without a
    // full pdfjs-handler fixture. (Mirrors the pattern in
    // tests/pdf/resolveAnchorGeometry.test.ts's own makeIndex helper.)
    TextLayerRegistry.set({
      pageIndex: PAGE_INDEX,
      fullText,
      tokens: [{
        str: fullText,
        itemIndex: 0,
        startChar: 0,
        endChar: fullText.length,
        bbox: { x: 10, y: 20, w: 300, h: 14 },
      }],
    });
  }

  it("REQUIRED: an exact/verbatim sentence resolves to a real rect", () => {
    const sentence = "Buffer solutions resist changes in pH through a weak acid and its conjugate base.";
    seedRegistry(`Some heading.\n\n${sentence} A second sentence follows here for context.`);
    const result = resolveTargetGeometry(PAGE_INDEX, sentence, 1.0);
    expect(result.rects.length).toBeGreaterThan(0);
    expect(result.boundaryComplete).toBe(true);
  });

  it("REQUIRED: a sentence that only partially/weakly overlaps the page text (the exact case the old 0.45-score fuzzy matcher would have accepted) resolves to NO rects — never a guessed location", () => {
    const pageText = "The mitochondria is the powerhouse of the cell, producing ATP through oxidative phosphorylation.";
    seedRegistry(pageText);
    // Shares several individual words with pageText but is not the same
    // sentence and does not appear verbatim or near-verbatim anywhere in it —
    // exactly the shape of match the old fuzzy matcher's token-overlap
    // scoring could still accept at a 0.45 threshold.
    const unrelatedButOverlapping = "The cell membrane regulates what enters and exits the cell using ATP-powered pumps.";
    const result = resolveTargetGeometry(PAGE_INDEX, unrelatedButOverlapping, 1.0);
    expect(result.rects).toEqual([]);
  });

  it("a completely absent sentence resolves to no rects, not a fallback guess", () => {
    seedRegistry("Nothing on this page relates to the query at all.");
    const result = resolveTargetGeometry(PAGE_INDEX, "Photosynthesis converts light energy into chemical energy in plants.", 1.0);
    expect(result.rects).toEqual([]);
  });
});

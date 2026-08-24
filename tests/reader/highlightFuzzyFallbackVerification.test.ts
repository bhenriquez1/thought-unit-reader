// tests/reader/highlightFuzzyFallbackVerification.test.ts
// P0 fix — components/SmartPDFViewer.tsx's legacy "legacy-dom" fuzzy
// highlight fallback (locateAnchor(), used only when the canonical
// TextLayerRegistry resolver in lib/pdf/resolveAnchorGeometry.ts reports an
// incomplete match) used to accept an UNVERIFIED end offset whenever its
// suffix-word search failed to find a pin point in the page text:
//
//   let endIdx = startIdx + baseText.length; // estimated fallback
//
// ...and returned that blind guess immediately, on the FIRST prefix length
// that matched, without ever trying a shorter prefix that might have pinned
// a real suffix. A guessed end offset can overshoot into the next sentence
// or undershoot mid-word — geometry built from it renders as a wrong or
// visibly fragmented highlight, matching the reported "coarse rectangular
// fragments" complaint (e.g. a pharmacology sentence rendering as several
// disjoint rects instead of one coherent highlight).
//
// The fix: never accept a match whose end wasn't actually found in the page
// text. If a given prefix length can't pin a real suffix, keep trying
// shorter prefix lengths; only return null (fail closed — no highlight, not
// a wrong one) if none of them can.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching this repo's established pattern for logic embedded in a large
// client component (SmartPDFViewer.tsx has no exported unit-testable
// surface for locateAnchor, which is a closure, not a module-level export).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/SmartPDFViewer.tsx"), "utf8");

function locateAnchorSource(): string {
  const idx = SRC.indexOf("function locateAnchor(baseText: string)");
  const endMarker = "\n      }\n\n      // Return all spans";
  const endIdx = SRC.indexOf(endMarker, idx);
  expect(idx).toBeGreaterThan(-1);
  expect(endIdx).toBeGreaterThan(idx);
  return SRC.slice(idx, endIdx);
}

describe("components/SmartPDFViewer.tsx — locateAnchor() never accepts an unverified end offset", () => {
  it("REQUIRED: the blind startIdx + baseText.length estimate is gone", () => {
    const block = locateAnchorSource();
    expect(block).not.toMatch(/let endIdx = startIdx \+ baseText\.length; \/\/ estimated fallback/);
  });

  it("REQUIRED: endIdx starts as null and is only ever set when the suffix search actually finds a pin point", () => {
    const block = locateAnchorSource();
    expect(block).toMatch(/let endIdx: number \| null = null;/);
    expect(block).toMatch(/if \(suffixOff !== -1\) \{\s*endIdx = searchFrom \+ suffixOff \+ suffix\.length;/);
  });

  it("REQUIRED: a prefix match with no verified end offset is skipped (tries a shorter prefix) instead of being returned", () => {
    const block = locateAnchorSource();
    expect(block).toMatch(/if \(endIdx === null\) continue;/);
    // The continue must come before the return, inside the same prefix-length loop.
    const continueIdx = block.indexOf("if (endIdx === null) continue;");
    const returnIdx = block.indexOf("return { startIdx, endIdx: Math.min(endIdx, concatText.length) };");
    expect(continueIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(continueIdx);
  });

  it("locateAnchor still returns null (fails closed) when no prefix length matches at all — unchanged, pre-existing behavior", () => {
    const block = locateAnchorSource();
    expect(block.trimEnd().endsWith("return null;")).toBe(true);
  });

  it("the fallback is still only reachable after canonical geometry resolution reports an incomplete match — this fix does not change when locateAnchor runs, only what it's allowed to accept", () => {
    expect(SRC).toMatch(/\/\/ Fall through to DOM-based matching \(logged as "legacy-dom" below\)\./);
  });
});

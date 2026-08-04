// tests/reader/highlightGeometryInvalidation.test.ts
// REQUIRED regression guard: page change invalidates prior geometry.
//
// SmartPDFViewer resolves HighlightTarget[] -> OverlayRect[] (PDF coordinates)
// and caches the result in overlayRects state. If that cache were keyed only
// on the target list's identity, navigating to a new page whose targets
// happen to produce an equal-looking key (or before the new page's targets
// have even arrived) could leave the PREVIOUS page's rects drawn on top of
// the new page — a stale-geometry leak. The fix already in place: highlightKey
// is composed from pageTruthKey + currentPage + target text (PureReaderView.tsx),
// so any page navigation always changes it, and SmartPDFViewer hard-clears all
// overlay state whenever highlightKey changes, before ever resolving new
// geometry. These tests pin that contract down explicitly.

import fs from "fs";
import path from "path";

const VIEWER_FILE = path.resolve(__dirname, "../../components/SmartPDFViewer.tsx");
const PURE_READER_FILE = path.resolve(__dirname, "../../components/PureReaderView.tsx");

describe("PureReaderView.tsx — highlightKey is built from pageTruthKey AND currentPage", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PURE_READER_FILE, "utf8"); });

  it("REQUIRED: highlightKey bakes in both pageTruthKey and currentPage, so ANY page navigation changes it — even if the new page's target text array happens to coincide with the old one's", () => {
    const idx = src.indexOf("highlightKey={");
    expect(idx).toBeGreaterThan(-1);
    const line = src.slice(idx, idx + 200);
    expect(line).toMatch(/\$\{pageTruthKey \?\? ""\}/);
    expect(line).toMatch(/\$\{currentPage\}/);
  });

  it("also bakes in target text, so a content change on the SAME page (e.g. AI enrichment replacing the deterministic baseline) also forces a new key", () => {
    const idx = src.indexOf("highlightKey={");
    const line = src.slice(idx, idx + 200);
    expect(line).toMatch(/surgeonHighlightTargets.*\.map\(t => t\.text\)\.join\("\|"\)/);
  });
});

describe("SmartPDFViewer.tsx — highlightKey change hard-clears prior geometry before any new resolution", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: a highlightKey change clears overlayRects, PDF-rendered anchors, and bumps overlayVersion (forcing DOM unmount/remount)", () => {
    const idx = src.indexOf("// Hard-clear all overlay state when highlightKey changes.");
    expect(idx).toBeGreaterThan(-1);
    const depsIdx = src.indexOf("}, [highlightKey]);", idx);
    expect(depsIdx).toBeGreaterThan(-1);
    const block = src.slice(idx, depsIdx + 30);
    expect(block).toMatch(/\}, \[highlightKey\]\)/);
    expect(block).toMatch(/setOverlayRects\(\[\]\)/);
    expect(block).toMatch(/setPdfRenderedAnchors\(\[\]\)/);
    expect(block).toMatch(/setOverlayVersion\(v => v \+ 1\)/);
  });

  it("the geometry-rebuild effect depends on highlightKey (not just highlightTargets identity), so a page change always re-resolves geometry rather than reusing a stale cache", () => {
    const idx = src.lastIndexOf("}, [highlightTargets, highlightNeighborhoods, currentPage, highlightKey, pageRenderKey]);");
    expect(idx).toBeGreaterThan(-1);
  });

  it("the overlay's keyed wrapper element includes highlightKey and overlayVersion in its React key, guaranteeing a DOM remount (not a stale-prop update) on page change", () => {
    expect(src).toMatch(/key=\{`overlay-\$\{highlightKey \?\? ""\}-\$\{overlayVersion\}`\}/);
  });
});

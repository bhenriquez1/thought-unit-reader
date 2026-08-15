// tests/pdf/wordRectOverlayGrounding.test.ts
// Reader stabilization fix #4 — the eye-follow word marker (WordRectOverlay
// in components/SmartPDFViewer.tsx) now resolves its geometry via
// resolveWordGeometry (lib/pdf/resolveAnchorGeometry.ts), the SAME
// TextLayerRegistry token index Surgeon highlighting resolves geometry from
// — not an independent DOM text-layer search (the old computeActiveWordRect,
// now removed). Static-analysis coverage, matching every other
// SmartPDFViewer regression test in this session (no jsdom/@testing-library
// in this repo's jest config).

import fs from "fs";
import path from "path";

const VIEWER_FILE = path.resolve(__dirname, "../../components/SmartPDFViewer.tsx");

describe("SmartPDFViewer.tsx — WordRectOverlay resolves geometry via the shared grounded resolver", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: imports resolveWordGeometry from the same module Surgeon highlighting uses", () => {
    expect(src).toMatch(/import \{ resolveTargetGeometry, resolveWordGeometry \} from "@\/lib\/pdf\/resolveAnchorGeometry";/);
  });

  it("REQUIRED: the old independent DOM text-layer matcher (computeActiveWordRect) no longer exists", () => {
    expect(src).not.toMatch(/function computeActiveWordRect/);
  });

  it("REQUIRED: WordRectOverlay's effect calls resolveWordGeometry, not a DOM span search", () => {
    const idx = src.indexOf("function WordRectOverlay(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 4000);
    expect(block).toMatch(/resolveWordGeometry\(pageIndex, text, word\.wordIndex, viewportScale\)/);
    expect(block).not.toMatch(/querySelector\(.*textLayer/);
  });

  it("REQUIRED: pageTruthKey is a WordRectOverlay prop AND is in the resolution effect's dependency array — a page change tears down any in-flight resolution before it can apply a stale rect", () => {
    const idx = src.indexOf("function WordRectOverlay(");
    const block = src.slice(idx, idx + 5500);
    expect(block).toMatch(/pageTruthKey\?:\s*string;/);
    expect(block).toMatch(/\}, \[activeSpokenWord, currentPage, pageTruthKey, viewportScale, pageRenderKey, highlightTargets\]\);/);
  });

  it("REQUIRED: the rendered marker is a non-covering underline, not a solid fill over the word", () => {
    const idx = src.indexOf("if (!wordRect) return null;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).not.toMatch(/background:\s*"rgba\(253,224,71,0\.85\)"/);
    expect(block).toMatch(/bottom:\s*-3,/);
    expect(block).toMatch(/height:\s*3,/);
  });

  it("the render call site passes pageTruthKey and viewportScale (effectiveZoom), not the old viewerRef/overlayRects props", () => {
    const idx = src.indexOf("<WordRectOverlay");
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/pageTruthKey=\{pageTruthKey\}/);
    expect(block).toMatch(/viewportScale=\{effectiveZoom\}/);
    expect(block).not.toMatch(/viewerRef=\{viewerRef\}/);
    expect(block).not.toMatch(/overlayRects=\{overlayRects\}/);
  });
});

describe("SmartPDFViewer.tsx — focusSnippet auto-scrolls only when the target has left the viewport", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: isFullyVisibleInContainer exists and gates the scrollIntoView call", () => {
    expect(src).toMatch(/function isFullyVisibleInContainer\(el: HTMLElement, container: HTMLElement\): boolean \{/);
    const idx = src.indexOf("if (!isFullyVisibleInContainer(target, container)) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/target\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\);/);
  });

  it("isFullyVisibleInContainer checks the target's rect against the container's rect on both edges", () => {
    const idx = src.indexOf("function isFullyVisibleInContainer");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/elRect\.top >= containerRect\.top && elRect\.bottom <= containerRect\.bottom/);
  });
});

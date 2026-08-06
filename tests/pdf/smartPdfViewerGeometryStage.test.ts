// tests/pdf/smartPdfViewerGeometryStage.test.ts
// Regression guard for the geometry_resolution/render diagnostic wiring in
// components/SmartPDFViewer.tsx — the layer between "grounded quote" and
// "actually painted on screen" that previously had no signal outside a
// console.log ([SURGEON_PIPELINE_DIAGNOSTIC]).

import fs from "fs";
import path from "path";

const VIEWER_FILE = path.resolve(__dirname, "../../components/SmartPDFViewer.tsx");

describe("SmartPDFViewer.tsx — annotationRenderStage computation", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: computes a majority-drop threshold (>=50%), not a single-miss threshold — one occasional geometry miss is not itself an error state", () => {
    const idx = src.indexOf("const geometryDropRatio =");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/geometryDropRatio >= 0\.5/);
  });

  it("reports 'render' only when geometry resolved but the final dedup pass dropped everything", () => {
    const idx = src.indexOf("const renderStage: \"geometry_resolution\" | \"render\" | null =");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/afterDedup\.length === 0/);
  });

  it("REQUIRED: writes stage + counts to the shared store after every overlay rebuild", () => {
    expect(src).toMatch(/useReadingFocusStore\.getState\(\)\.setAnnotationRenderStage\(\s*\n\s*renderStage,/);
  });

  it("counts object carries grounded/geometryResolved/rendered — matches the store's documented shape", () => {
    const idx = src.indexOf("useReadingFocusStore.getState().setAnnotationRenderStage(\n        renderStage,");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/grounded:\s*canonicalTargetCount/);
    expect(block).toMatch(/geometryResolved:\s*geometryResolvedCount/);
    expect(block).toMatch(/rendered:\s*afterDedup\.length/);
  });

  it("REQUIRED: a zoom change clears annotationRenderStage — stale rects are cleared here too (setOverlayRects([]))", () => {
    const idx = src.indexOf("setOverlayRects([]);\n    useReadingFocusStore.getState().setPdfRenderedAnchors([]);\n    useReadingFocusStore.getState().setAnnotationRenderStage(null, null);\n    dismissChip();");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: a highlightKey change (page navigation) clears annotationRenderStage — same invariant as the zoom-change clear above", () => {
    const idx = src.indexOf('console.log("[OVERLAY_CLEAR] highlightKey changed"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/setAnnotationRenderStage\(null, null\)/);
  });

  it("does not compute a render stage when there are zero canonical targets to resolve in the first place", () => {
    const idx = src.indexOf("const renderStage: \"geometry_resolution\" | \"render\" | null =");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/canonicalTargetCount === 0\s*\?\s*null/);
  });
});

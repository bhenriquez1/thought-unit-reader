// tests/pdf/surgeonPipelineDiagnostics.test.ts
//
// Regression guards for the SurgeonAnnotationPlan pipeline trace:
//   planner annotation → grounded quote → resolved sentence →
//   PDF text-layer match → geometry rectangles → PdfEvidenceOverlay render
//
// Requirement: production-safe diagnostics (no annotation TEXT logged, only
// counts + identity) at each stage, and the invariant "if the right panel
// shows a grounded textbook sentence, that exact sentence has visible PDF
// geometry" — implemented by having the right panel render directly from the
// SAME groundedAnnotations array SmartPDFViewer draws highlights from,
// rather than from the older, independent canonicalLeftPanelUnits pipeline.

import fs from "fs";
import path from "path";

const VIEWER_FILE       = path.resolve(__dirname, "../../components/SmartPDFViewer.tsx");
const HOOK_FILE         = path.resolve(__dirname, "../../components/reader/useSurgeonAnnotations.ts");
const RIGHT_PANEL_FILE  = path.resolve(__dirname, "../../components/reader/RightPanel.tsx");
const PURE_READER_FILE  = path.resolve(__dirname, "../../components/PureReaderView.tsx");
const INDEX_FILE        = path.resolve(__dirname, "../../pages/index.tsx");

describe("SmartPDFViewer.tsx — [SURGEON_PIPELINE_DIAGNOSTIC] geometry-stage counts", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("tracks geometryResolvedCount, incremented on every successful resolution path (fast-path, fallback-span, and direct-match)", () => {
    const incrementCount = (src.match(/geometryResolvedCount\+\+/g) ?? []).length;
    expect(incrementCount).toBe(3);
  });

  it("logs [SURGEON_PIPELINE_DIAGNOSTIC] with pageTruthKey, documentId, pageNumber, groundedCount, geometryResolvedCount, geometryFailedCount, renderedAnnotationCount — never annotation text", () => {
    const idx = src.indexOf('console.log("[SURGEON_PIPELINE_DIAGNOSTIC]"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/pageTruthKey:\s*pageTruthKey/);
    expect(block).toMatch(/documentId:\s*docId/);
    expect(block).toMatch(/pageNumber:\s*currentPage/);
    expect(block).toMatch(/groundedCount:/);
    expect(block).toMatch(/geometryResolvedCount,/);
    expect(block).toMatch(/geometryFailedCount:/);
    expect(block).toMatch(/renderedAnnotationCount:\s*afterDedup\.length/);
    expect(block).not.toMatch(/text:/);
    expect(block).not.toMatch(/groundedText/);
  });

  it("accepts pageTruthKey as a prop, threaded from the caller (not derived/parsed from highlightKey)", () => {
    expect(src).toMatch(/pageTruthKey\?:\s*string;/);
    expect(src).toMatch(/export default function SmartPDFViewer\(\{\s*\n\s*fileUrl,\s*\n\s*pageTruthKey,/);
  });
});

describe("PureReaderView.tsx — pageTruthKey threaded into SmartPDFViewer for the diagnostic", () => {
  it("passes pageTruthKey={pageTruthKey} to <SmartPDFViewer>", () => {
    const src = fs.readFileSync(PURE_READER_FILE, "utf8");
    const idx = src.indexOf("<SmartPDFViewer");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/pageTruthKey=\{pageTruthKey\}/);
  });
});

describe("useSurgeonAnnotations.ts — [SURGEON_PIPELINE_DIAGNOSTIC] planner/grounded-stage counts", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("logs returnedAnnotationCount and groundedCount at the cache-hit site, production-safe (no DEV gate)", () => {
    const idx = src.indexOf('stage: "cache-hit"');
    expect(idx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, idx - 120), idx);
    expect(before).not.toMatch(/if \(DEV\)\s*console\.log\(\s*$/);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/returnedAnnotationCount:\s*stored\.plan\.annotations\.length/);
    expect(block).toMatch(/groundedCount:\s*targets\.length/);
  });

  it("logs returnedAnnotationCount and groundedCount at the fresh-fetch site, production-safe (no DEV gate)", () => {
    const idx = src.indexOf('stage: "fetch"');
    expect(idx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, idx - 120), idx);
    expect(before).not.toMatch(/if \(DEV\)\s*console\.log\(\s*$/);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/returnedAnnotationCount:\s*data\.plan\.annotations\.length/);
    expect(block).toMatch(/groundedCount:\s*targets\.length/);
  });
});

describe("RightPanel.tsx — 'Grounded on This Page' renders from the SAME array as the PDF overlay", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RIGHT_PANEL_FILE, "utf8"); });

  it("accepts a groundedAnnotations prop typed as GroundedSurgeonAnnotation[]", () => {
    expect(src).toMatch(/import type \{ GroundedSurgeonAnnotation \} from "@\/lib\/highlights\/groundSurgeonQuotes"/);
    expect(src).toMatch(/groundedAnnotations\?:\s*GroundedSurgeonAnnotation\[\];/);
  });

  it("renders a-la-carte from groundedAnnotations.map, not from canonicalLeftPanelUnits", () => {
    const idx = src.indexOf("Grounded on This Page");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/groundedAnnotations\.map/);
    expect(block).toMatch(/a\.groundedText/);
  });
});

describe("pages/index.tsx — REQUIRED invariant: RightPanel and SmartPDFViewer read the SAME groundedAnnotations/highlightTargets source", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("RightPanel's groundedAnnotations prop and PureReaderView's surgeonHighlightTargets prop are both sourced from the one surgeonAnnotations object", () => {
    expect(src).toMatch(/groundedAnnotations=\{surgeonAnnotations\.groundedAnnotations\}/);
    expect(src).toMatch(/surgeonHighlightTargets=\{surgeonAnnotations\.highlightTargets\}/);
  });

  it("groundedAnnotations and highlightTargets come from ONE useSurgeonAnnotations() call — not two independent hook instances that could drift", () => {
    const occurrences = (src.match(/const surgeonAnnotations = useSurgeonAnnotations\(/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe("pages/index.tsx — [PIPELINE_WIRING_TRACE], the unified data-flow trace for one page", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: fires only when the Whiteboard is actually open, not on every render", () => {
    const idx = src.indexOf('console.log("[PIPELINE_WIRING_TRACE]"');
    expect(idx).toBeGreaterThan(-1);
    const effectIdx = src.lastIndexOf("useEffect(() => {", idx);
    const guardBlock = src.slice(effectIdx, idx);
    expect(guardBlock).toMatch(/if \(!showWhiteboardPanel\) return;/);
  });

  it("REQUIRED: PAGE section carries pageTruthKey, a one-way documentIdHash (never the raw bookId), and the page number", () => {
    const idx = src.indexOf('console.log("[PIPELINE_WIRING_TRACE]"');
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/pageTruthKey,/);
    expect(block).toMatch(/documentIdHash:\s*resolvedDocumentId \? hashDocumentId\(resolvedDocumentId\) : null,/);
    expect(block).toMatch(/page:\s*currentPage,/);
  });

  it("REQUIRED: SURGEON_PAGE_ANALYSIS documents that pageRole IS this app's page-type classification — there is no separate page-analysis call to report on", () => {
    const idx = src.indexOf("SURGEON_PAGE_ANALYSIS:");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/pageType:\s*plan\?\.pageRole \?\? null,/);
    expect(block).toMatch(/conceptCount:\s*plan\?\.annotations\.length \?\? 0,/);
    expect(block).toMatch(/relationshipCount,/);
  });

  it("relationshipCount is a REAL computed count (annotations with .relationship set), never fabricated", () => {
    const idx = src.indexOf("const relationshipCount = plan?.annotations.filter(a => !!a.relationship).length ?? 0;");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: exposes BOTH candidate Whiteboard title sources side by side — the exact mechanism behind a 'one random sentence' title", () => {
    const idx = src.indexOf("WHITEBOARD_RECEIVED:");
    const block = src.slice(idx, idx + 750);
    expect(block).toMatch(/surgeonPageThesis:\s*plan\?\.pageThesis \?\? null,/);
    expect(block).toMatch(/legacyStudyModelPageThesis:\s*\(currentPageStudyModel as any\)\?\.pageThesis \?\? null,/);
  });

  it("receivedCanonicalUnits reflects the REAL data actually available to WhiteboardPanel (whiteboardCanonicalEntries), not a guess", () => {
    const idx = src.indexOf("WHITEBOARD_RECEIVED:");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/receivedCanonicalUnits:\s*whiteboardCanonicalEntries\.length > 0,/);
  });
});

describe("SmartPDFViewer.tsx — [HIGHLIGHT_PIPELINE_TRACE], the exact 5-boundary-count trace", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: logs pageTextLength, annotationCount, groundedQuoteCount, geometryRectCount, renderedOverlayCount — the exact requested field names", () => {
    const idx = src.indexOf('console.log("[HIGHLIGHT_PIPELINE_TRACE]"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/pageTextLength:\s*pageTextLength \?\? null,/);
    expect(block).toMatch(/annotationCount:\s*surgeonAnnotationCount \?\? null,/);
    expect(block).toMatch(/groundedQuoteCount:\s*canonicalTargetCount,/);
    expect(block).toMatch(/geometryRectCount:\s*geometryResolvedCount,/);
    expect(block).toMatch(/renderedOverlayCount:\s*afterDedup\.length,/);
  });

  it("accepts pageTextLength and surgeonAnnotationCount as props, threaded from the caller", () => {
    expect(src).toMatch(/pageTextLength\?:\s*number;/);
    expect(src).toMatch(/surgeonAnnotationCount\?:\s*number;/);
  });
});

describe("PureReaderView.tsx — pageTextLength/surgeonAnnotationCount threaded into SmartPDFViewer for the trace", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PURE_READER_FILE, "utf8"); });

  it("passes pageTextLength and surgeonAnnotationCount into <SmartPDFViewer>", () => {
    const idx = src.indexOf("<SmartPDFViewer");
    const block = src.slice(idx, idx + 2200);
    expect(block).toMatch(/pageTextLength=\{pageText\?\.length \?\? 0\}/);
    expect(block).toMatch(/surgeonAnnotationCount=\{surgeonAnnotationCount \?\? 0\}/);
  });
});

describe("pages/index.tsx — surgeonAnnotationCount is the REAL pre-grounding count, not a guess", () => {
  it("passes plan.annotations.length (before grounding/density-limiting) as surgeonAnnotationCount", () => {
    const src = fs.readFileSync(INDEX_FILE, "utf8");
    expect(src).toMatch(/surgeonAnnotationCount=\{surgeonAnnotations\.plan\?\.annotations\.length \?\? 0\}/);
  });
});

describe("TldrawCanvas.tsx — [WHITEBOARD_STEP_DIAGNOSTIC] carries drawActionCount", () => {
  it("REQUIRED: distinct from totalTeachingSteps — counts only draw-shape/draw-arrow actions, not speak/pause/write/camera/emphasize/erase", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");
    const idx = src.indexOf('console.log("[WHITEBOARD_STEP_DIAGNOSTIC]"');
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/drawActionCount:\s*plan\.actions\.filter\(a => a\.type === "draw-shape" \|\| a\.type === "draw-freehand" \|\| a\.type === "draw-arrow"\)\.length,/);
  });
});

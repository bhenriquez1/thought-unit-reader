// tests/pdf/smartPdfViewerOcrFallback.test.ts
// Stabilization fix — OCR wired into the actual Reader extraction path.
// components/SmartPDFViewer.tsx has no jsdom/render coverage in this repo
// (testEnvironment: "node"), so this file follows the established pattern
// (e.g. tests/pdf/smartPdfViewerGeometryStage.test.ts) of source-level
// wiring guards. The extraction logic itself (extractPageText) has real
// behavioral test coverage in tests/pageIntelligence/extractPageText.test.ts.

import fs from "fs";
import path from "path";

const VIEWER_FILE = path.resolve(__dirname, "../../components/SmartPDFViewer.tsx");

describe("SmartPDFViewer.tsx — OCR fallback reuses the existing OCR engine", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: imports the existing lib/page-intelligence/extractor.ts engine rather than a new OCR implementation", () => {
    expect(src).toMatch(/import \{ extractPageText, renderPdfPageToDataUrl, shouldUseOCR \} from "@\/lib\/page-intelligence\/extractor";/);
  });

  it("does not import or reference tesseract.js directly — only through the shared extractor module", () => {
    expect(src).not.toMatch(/from ["']tesseract\.js["']/);
  });
});

describe("SmartPDFViewer.tsx — OCR only runs when the native text layer is unusable", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: onGetTextSuccess calls attemptOcrFallback in the else branch of the text.length > 20 check — never on a normal, uncorrupted text PDF", () => {
    const idx = src.indexOf("onGetTextSuccess={(textContent: any)");
    const block = src.slice(idx, idx + 1800);
    expect(block).toMatch(/if \(text\.length > 20 && !shouldUseOCR\(text\)\) \{/);
    expect(block).toMatch(/onPageTextExtracted\(currentPage, text\);/);
    expect(block).toMatch(/\} else \{[\s\S]*void attemptOcrFallback\(text\);[\s\S]*\}/);
  });

  it("REQUIRED (post-merge fix): the native-text-usable branch also checks shouldUseOCR, not just length — a long-but-corrupted page (unmapped-glyph marker characters) must fall through to OCR instead of being passed through as if clean", () => {
    const idx = src.indexOf("onGetTextSuccess={(textContent: any)");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/!shouldUseOCR\(text\)/);
  });

  it("REQUIRED: attemptOcrFallback itself re-checks shouldUseOCR before doing any OCR work — defense in depth against unnecessary OCR", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/if \(!shouldUseOCR\(nativeText\)\) return;/);
  });
});

describe("SmartPDFViewer.tsx — OCR output enters the same canonical pipeline as native text", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: a successful OCR result is written through the exact same onPageTextExtracted(pageNumber, text) callback the native path uses, not a separate channel", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 2200);
    expect(block).toMatch(/onPageTextExtracted\?\.\(requestPage, ocrText\);/);
  });

  it("never writes a near-empty OCR result — mirrors the native path's own text.length > 20 floor", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 2200);
    expect(block).toMatch(/if \(ocrText\.length > 20\) \{/);
  });
});

describe("SmartPDFViewer.tsx — page identity preservation and stale OCR result rejection", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: captures requestPage/requestPageTruthKey from the CURRENT props before the async OCR call starts", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/const requestPage = currentPage;/);
    expect(block).toMatch(/const requestPageTruthKey = pageTruthKey;/);
  });

  it("REQUIRED: always-current page identity is tracked in a ref updated by its own effect, so the completion handler never reads a captured-at-render-time value", () => {
    expect(src).toMatch(/const livePageIdentityRef = useRef\(\{ page: currentPage, pageTruthKey \}\);/);
    const idx = src.indexOf("const livePageIdentityRef = useRef");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/livePageIdentityRef\.current = \{ page: currentPage, pageTruthKey \};/);
    expect(block).toMatch(/\}, \[currentPage, pageTruthKey\]\);/);
  });

  it("REQUIRED: a stale OCR result (page/pageTruthKey no longer matches livePageIdentityRef) is rejected and never reaches onPageTextExtracted", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 2200);
    const staleCheckIdx = block.indexOf("if (live.page !== requestPage || live.pageTruthKey !== requestPageTruthKey) {");
    const writeIdx = block.indexOf("onPageTextExtracted?.(requestPage, ocrText);");
    expect(staleCheckIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(staleCheckIdx);
    // The stale branch must return before reaching the write.
    const staleBlock = block.slice(staleCheckIdx, writeIdx);
    expect(staleBlock).toMatch(/return;/);
  });

  it("REQUIRED: navigating away aborts any in-flight OCR run via AbortController, independent of the identity re-check", () => {
    expect(src).toMatch(/const ocrAbortRef = useRef<AbortController \| null>\(null\);/);
    const idx = src.indexOf("const ocrAbortRef = useRef");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/ocrAbortRef\.current\?\.abort\(\);/);
    expect(block).toMatch(/\}, \[currentPage, docId, pageTruthKey\]\);/);
  });

  it("OCR cache/dedup is keyed by docId, not the filename-derived fallback — matches resolveDocumentIdentity discipline used elsewhere in this pipeline", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/if \(!docId \|\| !pdfDocument\) return;/);
    expect(block).toMatch(/const requestKey = `\$\{docId\}:\$\{requestPage\}`;/);
  });
});

describe("SmartPDFViewer.tsx — R5: OCR'd pages register PDF-highlight/eye-guide geometry, not just text", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("REQUIRED: imports TextLayerRegistry and buildPageTextIndexFromOCR from the same canonical geometry module native pages already use", () => {
    expect(src).toMatch(/import \{ TextLayerRegistry, buildPageTextIndexFromOCR \} from "@\/lib\/page-intelligence\/textLayerIndex";/);
  });

  it("REQUIRED: the OCR page-image render and the geometry conversion share ONE named scale constant — a silent mismatch between them would misplace every highlight on an OCR'd page", () => {
    expect(src).toMatch(/const OCR_RENDER_SCALE = 2\.0;/);
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 2600);
    expect(block).toMatch(/renderPdfPageToDataUrl\(pdfDocument, requestPage, OCR_RENDER_SCALE\)/);
    expect(block).toMatch(/buildPageTextIndexFromOCR\(requestPage - 1, result\.ocrWords, OCR_RENDER_SCALE, ocrText\)/);
  });

  it("REQUIRED: registers geometry only inside the same ocrText.length > 20 gate that guards onPageTextExtracted — never for a near-empty/rejected OCR result", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 2600);
    const gateIdx = block.indexOf("if (ocrText.length > 20) {");
    expect(gateIdx).toBeGreaterThan(-1);
    // Search for the actual call site starting after the gate — an earlier
    // occurrence of the same string inside a comment (e.g. "see the
    // TextLayerRegistry.set() call below") must not count as the real one.
    const registerIdx = block.indexOf("TextLayerRegistry.set(\n", gateIdx);
    expect(registerIdx).toBeGreaterThan(gateIdx);
  });

  it("REQUIRED: only registers when Tesseract actually returned words — no empty-tokens index silently overwrites a page that might already have (better) geometry", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 2600);
    expect(block).toMatch(/if \(result\.ocrWords\?\.length\) \{[\s\S]{0,200}TextLayerRegistry\.set\(/);
  });

  it("REQUIRED: the registry write is epoch-guarded against a document switch that clears TextLayerRegistry while OCR is still running — captured BEFORE the async OCR call, matching pdfjs-handler.ts's own epoch discipline for the native path", () => {
    const idx = src.indexOf("const attemptOcrFallback = useCallback(");
    const block = src.slice(idx, idx + 2600);
    const epochCaptureIdx = block.indexOf("const requestTextEpoch = TextLayerRegistry.currentEpoch();");
    const extractCallIdx = block.indexOf("const result = await extractPageText(");
    const setCallIdx = block.indexOf("requestTextEpoch,");
    expect(epochCaptureIdx).toBeGreaterThan(-1);
    expect(epochCaptureIdx).toBeLessThan(extractCallIdx);
    expect(setCallIdx).toBeGreaterThan(extractCallIdx);
  });

  it("pageIndex passed to buildPageTextIndexFromOCR is 0-based (requestPage - 1) — matches every other TextLayerRegistry caller in this file (e.g. currentPage - 1 for resolveTargetGeometry)", () => {
    expect(src).toMatch(/buildPageTextIndexFromOCR\(requestPage - 1,/);
  });
});

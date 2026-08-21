// tests/reader/pageTextByPageBackgroundSeed.test.ts
// Reader architecture fix — pageTextByPage (what NoteLab/Learning Hub/
// Recall/Podcast/Study Guide actually read) was previously populated ONLY
// by SmartPDFViewer's onPageTextExtracted callback, mounted exclusively
// inside the "reader" shell tab (see pages/index.tsx's renderContent()) —
// so those five other tabs saw an empty map for any page the Reader tab
// hadn't been opened for yet, even though startBookProcessing's
// extractPageTextsIncremental already extracts every page's text
// unconditionally on every book load, via the same buildStructuredPageTextFull
// SmartPDFViewer itself uses (lib/pdfjs-handler.ts) — that output was simply
// being discarded after feeding thoughtUnits/TOC.
//
// No jsdom/render harness for pages/index.tsx in this repo — source
// inspection, matching this repo's established pattern for this exact file
// (e.g. tests/pdf/extractionRegistryEpoch.test.ts's own use of this style
// for extractPageTextsIncremental's caller).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — startBookProcessing background-fills pageTextByPage", () => {
  it("REQUIRED: the onBatch callback also writes into pageTextByPage, not just allPageTexts/pageUnitsMap", () => {
    const onBatchIdx = SRC.indexOf("onBatch: (pages, totalPages) => {");
    expect(onBatchIdx).toBeGreaterThan(-1);
    const block = SRC.slice(onBatchIdx, onBatchIdx + 1800);
    expect(block).toMatch(/setPageTextByPage\(\(prev\) => \{/);
  });

  it("REQUIRED: keys with the same `${documentId}:${pageNumber}` (1-based) format the live SmartPDFViewer path uses — documentId here is the function's own bookId param", () => {
    const onBatchIdx = SRC.indexOf("onBatch: (pages, totalPages) => {");
    const block = SRC.slice(onBatchIdx, onBatchIdx + 1800);
    expect(block).toMatch(/const key = `\$\{documentId\}:\$\{p\.pageIndex \+ 1\}`;/);
  });

  it("REQUIRED: never overwrites a page that already has text — a live SmartPDFViewer extraction always wins if it races this background pass", () => {
    const onBatchIdx = SRC.indexOf("onBatch: (pages, totalPages) => {");
    const block = SRC.slice(onBatchIdx, onBatchIdx + 1800);
    expect(block).toMatch(/if \(!next\.has\(key\)\) \{/);
  });

  it("applies the same length floor SmartPDFViewer's own write path uses, so near-empty extraction results don't seed a bad value", () => {
    const onBatchIdx = SRC.indexOf("onBatch: (pages, totalPages) => {");
    const block = SRC.slice(onBatchIdx, onBatchIdx + 1800);
    expect(block).toMatch(/if \(!p\.text \|\| p\.text\.length <= 20\) continue;/);
  });

  it("startBookProcessing runs unconditionally on file upload — not gated by activeShellTab — confirming this genuinely fixes the tab-independence gap", () => {
    const fnIdx = SRC.indexOf("const startBookProcessing = useCallback(");
    expect(fnIdx).toBeGreaterThan(-1);
    const onBatchIdx = SRC.indexOf("onBatch: (pages, totalPages) => {", fnIdx);
    const between = SRC.slice(fnIdx, onBatchIdx);
    expect(between).not.toMatch(/activeShellTab/);
  });
});

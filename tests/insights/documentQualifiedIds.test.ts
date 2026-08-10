// tests/insights/documentQualifiedIds.test.ts
// Regression coverage for the RC2 fix from the Thought Unit Engine identity
// audit: CanonicalEntryInput/VSGNode ids (via buildSurgeonEvidenceId) and
// VisualAnchor/ExpertAnchor ids (currentPageStudyModel.ts/canonicalLeftPanel.ts)
// were positional-only (page number + index/counter), with no documentId
// component — two different documents at "the same page number" could
// produce colliding ids (e.g. two unrelated books both producing
// "surgeon-3-0" or "va-p3-pageThesis-1"). Every id-construction site now
// folds in a document-qualifying value (bookId — the same value both halves
// of the Surgeon/Whiteboard cross-highlight already receive, so they still
// match each other).

import fs from "fs";
import path from "path";

describe("lib/insights/currentPageStudyModel.ts — VisualAnchor.id is bookId-qualified", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(path.resolve(__dirname, "../../lib/insights/currentPageStudyModel.ts"), "utf8"); });

  it("REQUIRED: the primary anchor id includes bookId, not just the page number", () => {
    expect(src).toMatch(/id:\s*`va-\$\{bookId\}-p\$\{page\}-\$\{s\.sourceField\}-\$\{n\}`/);
  });

  it("REQUIRED: the pageThesis-fallback anchor id includes bookId too", () => {
    expect(src).toMatch(/id:\s*`va-\$\{bookId\}-p\$\{page\}-pageThesis-fallback`/);
  });

  it("bookId is already this function's own parameter — no new prop threading needed", () => {
    expect(src).toMatch(/bookId: string,\s*\n\s*page: number,/);
  });
});

describe("lib/insights/canonicalLeftPanel.ts — page-text fallback ExpertAnchor.id is bookId-qualified", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(path.resolve(__dirname, "../../lib/insights/canonicalLeftPanel.ts"), "utf8"); });

  it("REQUIRED: extractPageTextFallbackUnits accepts a bookId param and folds it into the id", () => {
    expect(src).toMatch(/function extractPageTextFallbackUnits\(pageText: string, bookId: string, page: number, presetId: string\)/);
    expect(src).toMatch(/const id = bookId \? `clp-\$\{bookId\}-p\$\{page\}-text-\$\{i \+ 1\}` : `clp-p\$\{page\}-text-\$\{i \+ 1\}`/);
  });

  it("buildCanonicalLeftPanelUnits accepts an optional bookId and threads it to the fallback path", () => {
    expect(src).toMatch(/bookId\?:\s*string;/);
    expect(src).toMatch(/extractPageTextFallbackUnits\(pageText, bookId, page, presetId\)/);
  });
});

describe("pages/index.tsx — buildCanonicalLeftPanelUnits is called with the live bookId", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8"); });

  it("REQUIRED: the call site passes bookId", () => {
    const idx = src.indexOf("const built = buildCanonicalLeftPanelUnits({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/bookId,/);
  });
});

describe("components/reader/useSurgeonAnnotations.ts — HighlightTarget ids use the resolved document identity", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(path.resolve(__dirname, "../../components/reader/useSurgeonAnnotations.ts"), "utf8"); });

  it("REQUIRED: groundedAnnotationsToHighlightTargets takes a documentId param and passes it to buildSurgeonEvidenceId", () => {
    expect(src).toMatch(/function groundedAnnotationsToHighlightTargets\(\s*\n\s*grounded: GroundedSurgeonAnnotation\[\],\s*\n\s*documentId: string,\s*\n\s*pageNumber: number,\s*\n\s*\): HighlightTarget\[\]/);
    expect(src).toMatch(/const id = buildSurgeonEvidenceId\(documentId, pageNumber, i\);/);
  });

  it("REQUIRED: both call sites pass documentIdRef.current as the documentId", () => {
    const calls = [...src.matchAll(/groundedAnnotationsToHighlightTargets\(grounded, documentIdRef\.current, pageNumberRef\.current\)/g)];
    expect(calls.length).toBe(2);
  });
});

describe("lib/whiteboard/visualSceneGraph.ts — CanonicalEntryInput ids are document-qualified", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/visualSceneGraph.ts"), "utf8"); });

  it("REQUIRED: surgeonAnnotationsToCanonicalEntries takes a documentId param", () => {
    expect(src).toMatch(/export function surgeonAnnotationsToCanonicalEntries\(\s*\n\s*grounded:\s*GroundedSurgeonAnnotation\[\],\s*\n\s*documentId: string,\s*\n\s*pageNumber: number,/);
  });
});

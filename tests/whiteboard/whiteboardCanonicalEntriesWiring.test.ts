// tests/whiteboard/whiteboardCanonicalEntriesWiring.test.ts
// Regression guard: WhiteboardPanel.tsx has always had a `canonicalEntries` prop
// with the canonical Surgeon evidence — but until the original wiring change it was
// declared and never actually passed at the real pages/index.tsx call site, so
// the deterministic Scene Builder pipeline silently used independently-authored
// NoteCard[] data. This test guards against silently reverting
// to that "declared but never passed" state.

import fs from "fs";
import path from "path";

const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");
const PANEL_FILE  = path.resolve(__dirname, "../../components/WhiteboardPanel.tsx");

describe("pages/index.tsx — canonicalEntries actually reaches <WhiteboardPanel>", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("imports surgeonAnnotationsToCanonicalEntries from the Scene Builder adapter", () => {
    expect(src).toMatch(/import \{ surgeonAnnotationsToCanonicalEntries \} from "@\/lib\/whiteboard\/visualSceneGraph"/);
  });

  it("derives whiteboardCanonicalEntries from surgeonAnnotations.wholePageAnnotations (not the lossy highlightTargets, and not groundedAnnotations' PDF-margin-note density cap)", () => {
    const idx = src.indexOf("const whiteboardCanonicalEntries = useMemo(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/surgeonAnnotationsToCanonicalEntries\(surgeonAnnotations\.wholePageAnnotations, resolvedDocumentId, currentPage\)/);
    expect(block).not.toMatch(/surgeonAnnotations\.groundedAnnotations/);
  });

  it("the real <WhiteboardPanel> JSX block passes canonicalEntries={whiteboardCanonicalEntries}", () => {
    const idx = src.indexOf("<WhiteboardPanel");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/canonicalEntries=\{whiteboardCanonicalEntries\}/);
  });

  it("whiteboardCanonicalEntries is computed AFTER surgeonAnnotations is declared (no TDZ)", () => {
    const hookIdx = src.indexOf("const surgeonAnnotations = useSurgeonAnnotations({");
    const deriveIdx = src.indexOf("const whiteboardCanonicalEntries = useMemo(");
    expect(hookIdx).toBeGreaterThan(-1);
    expect(deriveIdx).toBeGreaterThan(hookIdx);
  });
});

describe("WhiteboardPanel.tsx — canonical Surgeon evidence is exclusive", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("does not fall back to NoteCards from the independent study-model pipeline", () => {
    expect(src).toMatch(/\(\) => canonicalEntries \?\? \[\]/);
    expect(src).not.toMatch(/noteCardsToCanonicalEntries/);
    expect(src).toMatch(/noteCards=\{\[\]\}/);
  });
});

describe("WhiteboardPanel.tsx — one resolved identity owns canvas and lesson persistence", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("REQUIRED: canvasStorageKey is built from effectivePageTruthKey, not a bare bookId_p{pageNumber} composite — a re-extraction that changes pageTruthKey for the SAME page slot must get a genuinely distinct persistence key", () => {
    const idx = src.indexOf("const canvasStorageKey = effectivePageTruthKey");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/\$\{effectiveLearningDocumentId\}_\$\{effectivePageTruthKey\}/);
  });

  it("effectivePageTruthKey is computed once and reused for both the storage key and the TldrawCanvas pageTruthKey prop — no duplicated fallback logic that could drift", () => {
    const idx = src.indexOf("const effectivePageTruthKey =");
    expect(idx).toBeGreaterThan(-1);
    expect(src).toMatch(/pageTruthKey=\{effectivePageTruthKey\}/);
    // The old duplicated inline fallback expression must not still exist elsewhere.
    const occurrences = (src.match(/pageTruthKey \?\? \(currentPage != null \? buildPageTruthKey\(effectiveLearningDocumentId, currentPage\) : undefined\)/g) ?? []).length;
    expect(occurrences).toBe(1); // exactly the one definition of effectivePageTruthKey itself
  });

  it("REQUIRED: falls back through the ONE canonical pageTruthKey builder, not a locally-reimplemented format, when no real pageTruthKey is passed", () => {
    const idx = src.indexOf("const effectivePageTruthKey =");
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/pageTruthKey \?\? \(currentPage != null \? buildPageTruthKey\(effectiveLearningDocumentId, currentPage\) : undefined\)/);
  });

  it("imports the shared builder from lib/useActivePageIntelligence.ts rather than reimplementing the format inline", () => {
    expect(src).toMatch(/import \{ buildPageTruthKey \} from "@\/lib\/useActivePageIntelligence"/);
  });

  it("passes the resolved document identity to TldrawCanvas instead of bookId", () => {
    expect(src).toMatch(/documentId=\{effectiveLearningDocumentId\}/);
    expect(src).not.toMatch(/documentId=\{bookId\}/);
  });
});

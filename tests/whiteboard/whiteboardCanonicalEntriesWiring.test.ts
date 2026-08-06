// tests/whiteboard/whiteboardCanonicalEntriesWiring.test.ts
// Regression guard: WhiteboardPanel.tsx has always had a `canonicalEntries` prop
// with the right fallback logic (canonicalEntries?.length > 0 ? canonicalEntries
// : noteCardsToCanonicalEntries(teachNoteCards)) — but until this change it was
// declared and never actually passed at the real pages/index.tsx call site, so
// the deterministic Scene Builder pipeline silently always fell back to
// OpenAI-authored NoteCard[] data. This test guards against silently reverting
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
    expect(block).toMatch(/surgeonAnnotationsToCanonicalEntries\(surgeonAnnotations\.wholePageAnnotations, currentPage\)/);
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

describe("WhiteboardPanel.tsx — canonicalEntries fallback logic is unchanged", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("still falls back to noteCardsToCanonicalEntries(teachNoteCards) when canonicalEntries is empty", () => {
    expect(src).toMatch(/canonicalEntries && canonicalEntries\.length > 0\s*\n\s*\? canonicalEntries\s*\n\s*: noteCardsToCanonicalEntries\(teachNoteCards\)/);
  });
});

describe("WhiteboardPanel.tsx — canvas persistence key includes pageTruthKey, not just bookId + pageNumber", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("REQUIRED: canvasStorageKey is built from effectivePageTruthKey, not a bare bookId_p{pageNumber} composite — a re-extraction that changes pageTruthKey for the SAME page slot must get a genuinely distinct persistence key", () => {
    const idx = src.indexOf("const canvasStorageKey = bookId && effectivePageTruthKey");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/\$\{bookId\}_\$\{effectivePageTruthKey\}/);
  });

  it("effectivePageTruthKey is computed once and reused for both the storage key and the TldrawCanvas pageTruthKey prop — no duplicated fallback logic that could drift", () => {
    const idx = src.indexOf("const effectivePageTruthKey =");
    expect(idx).toBeGreaterThan(-1);
    expect(src).toMatch(/pageTruthKey=\{effectivePageTruthKey\}/);
    // The old duplicated inline fallback expression must not still exist elsewhere.
    const occurrences = (src.match(/pageTruthKey \?\? \(bookId && currentPage != null \? `\$\{bookId\}::\$\{currentPage\}` : undefined\)/g) ?? []).length;
    expect(occurrences).toBe(1); // exactly the one definition of effectivePageTruthKey itself
  });

  it("falls back to the same bookId::pageNumber synthetic key as before when no real pageTruthKey is passed", () => {
    const idx = src.indexOf("const effectivePageTruthKey =");
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/pageTruthKey \?\? \(bookId && currentPage != null \? `\$\{bookId\}::\$\{currentPage\}` : undefined\)/);
  });
});

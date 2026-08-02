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

  it("derives whiteboardCanonicalEntries from surgeonAnnotations.groundedAnnotations (not the lossy highlightTargets)", () => {
    const idx = src.indexOf("const whiteboardCanonicalEntries = useMemo(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/surgeonAnnotationsToCanonicalEntries\(surgeonAnnotations\.groundedAnnotations, currentPage\)/);
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

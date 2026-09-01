// tests/apex/testLabSourceBindingWiring.test.ts
// TestLab source binding fix — source inspection for the resolution logic
// in app/apex/page.tsx and app/apex/generator/page.tsx (no jsdom/render
// harness for these App Router pages in this repo, matching this repo's
// established pattern for pages/index.tsx's own embedded logic).

import fs from "fs";
import path from "path";

const DASHBOARD_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/page.tsx"), "utf8");
const GENERATOR_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/generator/page.tsx"), "utf8");

describe("app/apex/page.tsx — dashboard source resolution never falls back to a hardcoded/cached title", () => {
  it("REQUIRED: selection state is keyed by documentId, not bookId/title", () => {
    expect(DASHBOARD_SRC).toMatch(/const \[selectedDocumentId, setSelectedDocumentId\] = useState<string \| null>\(null\);/);
    expect(DASHBOARD_SRC).toMatch(/const selectedBook = useMemo\(\s*\n\s*\(\) => books\.find\(\(book\) => book\.documentId === selectedDocumentId\) \?\? null,/);
  });

  it("REQUIRED: resolution priority is query param, then legacy bookId param, then last-selected, then most-recent upload — never a raw fallback string", () => {
    const idx = DASHBOARD_SRC.indexOf("setSelectedDocumentId((current) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = DASHBOARD_SRC.slice(idx, idx + 900);
    expect(block).toMatch(/searchParams\?\.get\("sourceDocumentId"\)/);
    expect(block).toMatch(/searchParams\?\.get\("sourceBookId"\)/);
    expect(block).toMatch(/getLastSelectedTestLabDocumentId\(\)/);
    expect(block).toMatch(/catalogue\[0\]\?\.documentId \?\? null/);
  });

  it("REQUIRED: persists every validated selection, and only a validated one", () => {
    expect(DASHBOARD_SRC).toMatch(/if \(selectedBook\) setLastSelectedTestLabDocumentId\(selectedBook\.documentId\);/);
  });

  it("REQUIRED: carries diagnostics and flags a hard mismatch, never silently", () => {
    const idx = DASHBOARD_SRC.indexOf("[TESTLAB_SOURCE_DIAGNOSTICS]");
    expect(idx).toBeGreaterThan(-1);
    const block = DASHBOARD_SRC.slice(Math.max(0, idx - 500), idx + 50);
    expect(block).toMatch(/selectedTestLabDocumentId: selectedDocumentId,/);
    expect(block).toMatch(/selectedLibraryRecordFound: !!selectedBook,/);
    expect(block).toMatch(/selectedDocumentTitle: selectedBook\?\.bookTitle \?\? null,/);
    expect(block).toMatch(/sourceThoughtUnitCount: selectedBook\?\.noteCount \?\? 0,/);
    expect(DASHBOARD_SRC).toMatch(/\[TESTLAB_SOURCE_STATE_MISMATCH\]/);
  });
});

describe("app/apex/generator/page.tsx — builder source resolution mirrors the dashboard's own binding", () => {
  it("REQUIRED: resolution priority is sourceDocumentId, then legacy sourceBookId, then last-selected, then most-recent upload", () => {
    const idx = GENERATOR_SRC.indexOf("useEffect(() => {\n    if (books.length === 0 || selectedDocumentId) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = GENERATOR_SRC.slice(idx, idx + 700);
    expect(block).toMatch(/book\.documentId === requestedSourceDocumentId/);
    expect(block).toMatch(/book\.bookId === requestedSourceBookId/);
    expect(block).toMatch(/getLastSelectedTestLabDocumentId\(\)/);
    expect(block).toMatch(/books\[0\]\.documentId/);
  });

  it("REQUIRED: bookId is a reactive mirror of selectedDocumentId, never set independently elsewhere", () => {
    expect((GENERATOR_SRC.match(/setBookId\(/g) ?? []).length).toBe(1);
    const idx = GENERATOR_SRC.indexOf("const match = selectedDocumentId ? books.find((b) => b.documentId === selectedDocumentId) : null;\n    setBookId(match?.bookId ?? '');");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: handleBookSelect takes a documentId, and the book-list click sites pass book.documentId", () => {
    expect(GENERATOR_SRC).toMatch(/function handleBookSelect\(documentId: string\) \{\s*\n\s*setSelectedDocumentId\(documentId\);/);
    expect(GENERATOR_SRC).toMatch(/onClick=\{\(\) => handleBookSelect\(book\.documentId\)\}/);
    expect(GENERATOR_SRC).toMatch(/key=\{book\.documentId\}/);
  });

  it("REQUIRED: carries diagnostics including the incoming Reader documentId, and flags a hard mismatch", () => {
    const idx = GENERATOR_SRC.indexOf("[TESTLAB_SOURCE_DIAGNOSTICS]");
    expect(idx).toBeGreaterThan(-1);
    const block = GENERATOR_SRC.slice(Math.max(0, idx - 500), idx + 50);
    expect(block).toMatch(/activeReaderDocumentId: requestedSourceDocumentId \|\| null,/);
    expect(block).toMatch(/selectedTestLabDocumentId: selectedDocumentId,/);
    expect(block).toMatch(/selectedLibraryRecordFound: !!match,/);
    expect(block).toMatch(/sourceThoughtUnitCount: match\?\.noteCount \?\? 0,/);
    expect(GENERATOR_SRC).toMatch(/\[TESTLAB_SOURCE_STATE_MISMATCH\]/);
  });
});

describe("pages/index.tsx — every Reader→TestLab entry point carries the active document's real identity", () => {
  const INDEX_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

  it("REQUIRED: the global nav TestLab button carries resolvedDocumentId as sourceDocumentId", () => {
    const idx = INDEX_SRC.indexOf('title="Open Avrrio TestLab"');
    expect(idx).toBeGreaterThan(-1);
    const block = INDEX_SRC.slice(Math.max(0, idx - 500), idx);
    expect(block).toMatch(/router\.push\(resolvedDocumentId \? `\/apex\?sourceDocumentId=\$\{encodeURIComponent\(resolvedDocumentId\)\}` : "\/apex"\);/);
  });
});

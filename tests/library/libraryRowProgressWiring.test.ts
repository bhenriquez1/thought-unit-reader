// tests/library/libraryRowProgressWiring.test.ts
// L7 — source inspection for the Library drawer's per-row progress wiring
// in pages/index.tsx (no jsdom/render harness for this file in this repo,
// matching this repo's established pattern).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — the Library drawer renders real per-book progress, not just a filename", () => {
  it("imports LibraryRowProgress", () => {
    expect(SRC).toMatch(/import LibraryRowProgress from "@\/components\/library\/LibraryRowProgress";/);
  });

  it("REQUIRED: each pdfLibrary row renders LibraryRowProgress, keyed by the same filename-derived bookId the reader itself uses", () => {
    const idx = SRC.indexOf("pdfLibrary.map((pdf) => (");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1200);
    expect(block).toMatch(/<LibraryRowProgress bookId=\{pdf\.name\.replace\(\/\\\.\[Pp\]\[Dd\]\[Ff\]\$\/, ""\) \|\| "book"\}\s*\/>/);
  });

  it("still loads the book on click and still offers delete — the progress line is additive, not a replacement", () => {
    const idx = SRC.indexOf("pdfLibrary.map((pdf) => (");
    const block = SRC.slice(idx, idx + 1200);
    expect(block).toMatch(/onClick=\{\(\) => handleLoadPDF\(pdf\.url, pdf\.name, pdf\.localDocumentId, pdf\.id\)\}/);
    expect(block).toMatch(/onClick=\{\(\) => handleDeletePDF\(pdf\.id, pdf\.name, pdf\.isLocal, pdf\.localDocumentId\)\}/);
  });
});

// tests/reader/viewSourceBookIdentityGuard.test.ts
// P0 fix — pages/index.tsx's "View Source in Reader" mount effect used to
// only ever call setCurrentPage(link.pageNumber); link.documentId was
// written by app/apex/results/page.tsx but never read on the way back. If
// a different book (or none) happened to be open in Reader, the student
// saw THAT book's content at a confidently-labeled page number, with
// nothing indicating it was wrong.
//
// pages/index.tsx has no jsdom/React Testing Library in this repo's Jest
// config — matching every other pages/index.tsx wiring test in this
// session, this is static-analysis coverage of the actual source, not a
// rendered-component test.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — View Source never silently shows the wrong book's content", () => {
  it("REQUIRED: the mount effect stages the link instead of applying it directly — no immediate setCurrentPage", () => {
    const idx = SRC.indexOf("const link = readAndClearViewSourceLink();");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 120);
    expect(block).toMatch(/if \(link\) setPendingViewSourceLink\(link\);/);
    expect(block).not.toMatch(/setCurrentPage/);
  });

  it("REQUIRED: the page jump only fires once bookId actually equals the link's documentId", () => {
    const idx = SRC.indexOf("if (!pendingViewSourceLink) return;\n    if (!bookId || bookId !== pendingViewSourceLink.documentId) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/setCurrentPage\(pendingViewSourceLink\.pageNumber\);/);
    expect(block).toMatch(/setPendingViewSourceLink\(null\);/);
  });

  it("REQUIRED: re-evaluates on every bookId change, not just once on mount — the match effect is keyed on [bookId, pendingViewSourceLink]", () => {
    const idx = SRC.indexOf("}, [bookId, pendingViewSourceLink, setCurrentPage]);");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: a mismatched book renders an explicit prompt instead of silently showing the wrong content", () => {
    const idx = SRC.indexOf("pendingViewSourceLink && bookId !== pendingViewSourceLink.documentId");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/This question is from/);
    expect(block).toMatch(/handleViewSourcePickFromLibrary/);
  });

  it("REQUIRED: picking the book from the library matches by filename and loads the real entry — never fabricates a book", () => {
    const idx = SRC.indexOf("const handleViewSourcePickFromLibrary = useCallback(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/pdfLibrary\.find\(/);
    expect(block).toMatch(/p\.name\.replace\(\/\\\.\[Pp\]\[Dd\]\[Ff\]\$\/, ""\) === pendingViewSourceLink\.documentId/);
    // Identity-spine remediation — also threads match.id (the real
    // canonical Library documentId) through, so resolvedDocumentId
    // resolves correctly for a Firebase-sourced book opened this way too.
    expect(block).toMatch(/handleLoadPDFRef\.current\?\.\(match\.url, match\.name, match\.localDocumentId, match\.id\);/);
    expect(block).toMatch(/setShowLibrary\(true\);/); // falls back to the library drawer when no match exists
  });
});

// tests/elena/childReaderTab.test.ts
// Static-analysis coverage for components/elena/ChildReaderTab.tsx — E2's
// child Reader shell. It must mount the SAME SmartPDFViewer the adult
// Reader uses (dynamic import, ssr:false, matching pages/index.tsx's own
// import convention) against the child's own book, not a bespoke viewer.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/elena/ChildReaderTab.tsx"),
  "utf8",
);

describe("ChildReaderTab — reuses the adult Reader's SmartPDFViewer", () => {
  it("REQUIRED: dynamically imports SmartPDFViewer with ssr:false, matching pages/index.tsx's convention", () => {
    expect(SRC).toMatch(/dynamic\(\(\) => import\("@\/components\/SmartPDFViewer"\), \{ ssr: false \}\)/);
  });

  it("REQUIRED: passes the canonical documentId as docId and builds pageTruthKey from it — same identity infrastructure as the adult Reader", () => {
    const idx = SRC.indexOf("<SmartPDFViewer");
    const block = SRC.slice(idx, SRC.indexOf("/>", idx));
    expect(block).toMatch(/docId=\{activeBook\.documentId\}/);
    expect(block).toMatch(/pageTruthKey=\{`\$\{activeBook\.documentId\}::\$\{activeBook\.currentPage\}::t`\}/);
  });

  it("wires currentPage/onPageChange/onPageCount/onPageTextExtracted so the caller can persist resume position", () => {
    const idx = SRC.indexOf("<SmartPDFViewer");
    const block = SRC.slice(idx, SRC.indexOf("/>", idx));
    expect(block).toMatch(/currentPage=\{activeBook\.currentPage\}/);
    expect(block).toMatch(/onPageChange=\{onPageChange\}/);
    expect(block).toMatch(/onPageCount=\{onPageCount\}/);
    expect(block).toMatch(/onPageTextExtracted=\{onPageTextExtracted\}/);
  });
});

describe("ChildReaderTab — empty state offers upload, not a dead end", () => {
  it("REQUIRED: shows an upload CTA when no book is open", () => {
    expect(SRC).toMatch(/function EmptyReaderState/);
    expect(SRC).toMatch(/Upload a Book/);
  });

  it("lists the child's existing library as an alternative to uploading", () => {
    const idx = SRC.indexOf("function EmptyReaderState");
    const block = SRC.slice(idx, idx + 1500);
    expect(block).toMatch(/library\.map\(entry =>/);
    expect(block).toMatch(/onOpenBook\(entry\)/);
  });
});

describe("ChildReaderTab — ReadingBuddy runs against Elena's own book, not the adult tab's", () => {
  it("passes activeBook.title/currentPage as bookTitle/currentPage, sourced from Elena's own state", () => {
    const idx = SRC.indexOf("<ReadingBuddy");
    const block = SRC.slice(idx, SRC.indexOf("/>", idx));
    expect(block).toMatch(/bookTitle=\{activeBook\.title\}/);
    expect(block).toMatch(/currentPage=\{activeBook\.currentPage\}/);
  });
});

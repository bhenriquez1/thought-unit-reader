// tests/elena/groundedContextWiring.test.ts
// E3 — static-analysis coverage proving groundedContext (built from real
// CanonicalThoughtUnits) is threaded end-to-end: API endpoints prefer it
// over raw pageText, and the two client components fetch it before posting.

import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
}

describe("pages/api/elena-buddy.ts — prefers groundedContext over raw pageText", () => {
  const src = read("pages/api/elena-buddy.ts");

  it("REQUIRED: page content block prefers groundedContext, falls back to pageText", () => {
    expect(src).toMatch(/const pageContent = body\.groundedContext \|\| body\.pageText;/);
    expect(src).toMatch(/<page_content>\\n\$\{pageContent\}\\n<\/page_content>/);
  });

  it("sanitises groundedContext to the same 3000-char cap as pageText", () => {
    expect(src).toMatch(/groundedContext: body\.groundedContext \? body\.groundedContext\.slice\(0, 3000\) : undefined,/);
  });
});

describe("pages/api/elena-vocab.ts — prefers groundedContext over raw pageText", () => {
  const src = read("pages/api/elena-vocab.ts");

  it("REQUIRED: page content block prefers groundedContext, falls back to pageText", () => {
    expect(src).toMatch(/const pageContent = body\.groundedContext \|\| body\.pageText;/);
  });

  it("sanitises groundedContext to the same 3000-char cap as pageText", () => {
    expect(src).toMatch(/groundedContext: body\.groundedContext \? body\.groundedContext\.slice\(0, 3000\) : undefined,/);
  });

  it("pageText is still required — groundedContext is additive, not a replacement for the existing validation contract", () => {
    expect(src).toMatch(/if \(!raw\?\.pageText\?\.trim\(\)\)/);
  });
});

describe("components/elena/ReadingBuddy.tsx — fetches grounded context before posting", () => {
  const src = read("components/elena/ReadingBuddy.tsx");

  it("REQUIRED: imports loadGroundedPageContext and accepts a documentId prop", () => {
    expect(src).toMatch(/import \{ loadGroundedPageContext \} from "@\/lib\/elena\/childTeachingAdapter";/);
    expect(src).toMatch(/documentId\?:\s*string;/);
  });

  it("REQUIRED: sendMessage fetches grounded context when documentId+currentPage are present and sends it alongside pageText", () => {
    const idx = src.indexOf("const sendMessage = useCallback");
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/documentId && currentPage\s*\n\s*\? await loadGroundedPageContext\(documentId, currentPage\)\s*\n\s*: null;/);
    expect(block).toMatch(/groundedContext: groundedContext \?\? undefined,/);
  });
});

describe("components/elena/ChildReaderTab.tsx — passes documentId through to ReadingBuddy", () => {
  const src = read("components/elena/ChildReaderTab.tsx");

  it("REQUIRED: ReadingBuddy receives activeBook.documentId", () => {
    const idx = src.indexOf("<ReadingBuddy");
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/documentId=\{activeBook\.documentId\}/);
  });
});

describe("components/elena/ElenaChildWorkspace.tsx — VocabularyTab fetches grounded context, receives documentId", () => {
  const src = read("components/elena/ElenaChildWorkspace.tsx");

  it("REQUIRED: extractWords fetches grounded context when documentId+currentPage are present", () => {
    const idx = src.indexOf("const extractWords = useCallback");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/documentId && currentPage\s*\n\s*\? await loadGroundedPageContext\(documentId, currentPage\)\s*\n\s*: null;/);
    expect(block).toMatch(/groundedContext: groundedContext \?\? undefined,/);
  });

  it("REQUIRED: the vocabulary tab render call site passes activeBook?.documentId", () => {
    const idx = src.indexOf('<VocabularyTab');
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/documentId=\{activeBook\?\.documentId\}/);
  });
});

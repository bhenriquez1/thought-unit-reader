// tests/insights/resolveDocumentIdentity.test.ts
// Regression coverage for the RC1 fix from the Thought Unit Engine identity
// audit: pageTruthKey (and every cache keyed on it) was built from `bookId`
// (the PDF filename minus extension) standing in for a real documentId — two
// different PDFs sharing a filename produced an IDENTICAL pageTruthKey and
// collided across the annotation plan store, the professor lesson plan
// store, and the content-hash integrity check.

import { resolveDocumentIdentity } from "../../lib/insights/resolveDocumentIdentity";

describe("resolveDocumentIdentity — preference order", () => {
  it("prefers the real documentId when present, ignoring fileUrl and bookId entirely", () => {
    const id = resolveDocumentIdentity({ documentId: "uuid-123", fileUrl: "blob:whatever", bookId: "Textbook" });
    expect(id).toBe("uuid-123");
  });

  it("falls back to a hash of fileUrl when documentId is null", () => {
    const id = resolveDocumentIdentity({ documentId: null, fileUrl: "https://cdn.example.com/a.pdf", bookId: "Textbook" });
    expect(id).not.toBe("Textbook");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("falls back to a hash of fileUrl when documentId is undefined", () => {
    const id = resolveDocumentIdentity({ documentId: undefined, fileUrl: "https://cdn.example.com/a.pdf", bookId: "Textbook" });
    expect(id).not.toBe("Textbook");
  });

  it("falls back to bookId only when neither documentId nor fileUrl is available", () => {
    const id = resolveDocumentIdentity({ documentId: null, fileUrl: null, bookId: "Textbook" });
    expect(id).toBe("Textbook");
  });

  it("is deterministic — the same inputs always produce the same identity", () => {
    const a = resolveDocumentIdentity({ documentId: null, fileUrl: "https://cdn.example.com/a.pdf", bookId: "Textbook" });
    const b = resolveDocumentIdentity({ documentId: null, fileUrl: "https://cdn.example.com/a.pdf", bookId: "Textbook" });
    expect(a).toBe(b);
  });
});

describe("resolveDocumentIdentity — REQUIRED: fixes the same-filename collision (RC1 reproducer)", () => {
  it("two different local uploads sharing a filename get DIFFERENT identities when each has its own real documentId", () => {
    // Two PDFs both named "Textbook.pdf" — this is exactly the collision the
    // audit found: before the fix, resolveDocumentIdentity didn't exist and
    // callers passed bookId ("Textbook") directly, so both uploads produced
    // an identical pageTruthKey no matter what their real IDB documentId was.
    const bookA = resolveDocumentIdentity({ documentId: "uuid-aaa", fileUrl: "blob:session-a", bookId: "Textbook" });
    const bookB = resolveDocumentIdentity({ documentId: "uuid-bbb", fileUrl: "blob:session-b", bookId: "Textbook" });
    expect(bookA).not.toBe(bookB);
  });

  it("two different Firebase-hosted documents sharing a filename (no local documentId) still get DIFFERENT identities via the fileUrl hash", () => {
    const bookA = resolveDocumentIdentity({ documentId: null, fileUrl: "https://storage.example.com/uid1/Textbook.pdf", bookId: "Textbook" });
    const bookB = resolveDocumentIdentity({ documentId: null, fileUrl: "https://storage.example.com/uid2/Textbook.pdf", bookId: "Textbook" });
    expect(bookA).not.toBe(bookB);
  });

  it("the SAME document reloaded (same fileUrl, no documentId) produces the SAME identity — reload must not orphan the cache", () => {
    const first = resolveDocumentIdentity({ documentId: null, fileUrl: "https://storage.example.com/uid1/Textbook.pdf", bookId: "Textbook" });
    const second = resolveDocumentIdentity({ documentId: null, fileUrl: "https://storage.example.com/uid1/Textbook.pdf", bookId: "Textbook" });
    expect(first).toBe(second);
  });
});

describe("resolveDocumentIdentity.ts — wired into the canonical pageTruthKey builder", () => {
  const fs = require("fs");
  const path = require("path");
  const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: useActivePageIntelligence receives the resolved identity, not bookId directly", () => {
    const idx = src.indexOf("} = useActivePageIntelligence({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/documentId:\s*resolvedDocumentId,/);
    expect(block).not.toMatch(/documentId:\s*bookId,/);
  });

  it("resolvedDocumentId is memoized off resolveDocumentIdentity({ documentId: currentLocalDocumentId, fileUrl, bookId })", () => {
    const idx = src.indexOf("const resolvedDocumentId = useMemo(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/resolveDocumentIdentity\(\{ documentId: currentLocalDocumentId, fileUrl, bookId \}\)/);
  });
});

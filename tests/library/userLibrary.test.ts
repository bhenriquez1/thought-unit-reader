// tests/library/userLibrary.test.ts
// TestLab source binding fix — loadUserLibrary() is the one shared read
// path every module (Reader, NoteLab, Recall, Learning Hub, TestLab)
// should use for "what books does this user have." Real behavioral tests
// for the guest/local-library path (no window/localStorage gymnastics
// needed — this repo's jest setup already stubs localStorage globally);
// the signed-in Firebase path is covered indirectly by
// tests/apex/bookCatalogueSourceBinding.test.ts, which mocks this module
// outright.

import { loadUserLibrary, deriveBookIdFromFilename } from "@/lib/library/userLibrary";

const LOCAL_LIBRARY_KEY = "avrrio-local-library";

// loadUserLibrary() resolves the current Firebase uid via a dynamic
// import of lib/firebase.ts's listenForAuthChanges, guarded by
// `typeof window === "undefined"` — this suite's jest environment is
// "node" (no window global), so that branch always short-circuits to the
// guest/local path without needing to mock Firebase auth at all. That's
// exactly the path under test here.

describe("deriveBookIdFromFilename", () => {
  it("strips a .pdf extension case-insensitively", () => {
    expect(deriveBookIdFromFilename("Cell Biology.pdf")).toBe("Cell Biology");
    expect(deriveBookIdFromFilename("Cell Biology.PDF")).toBe("Cell Biology");
  });

  it("falls back to 'book' for an empty/extension-only name", () => {
    expect(deriveBookIdFromFilename(".pdf")).toBe("book");
    expect(deriveBookIdFromFilename("")).toBe("book");
  });
});

describe("loadUserLibrary — guest/local path", () => {
  beforeEach(() => { localStorage.clear(); });

  it("returns an empty array when nothing is stored", async () => {
    expect(await loadUserLibrary()).toEqual([]);
  });

  it("REQUIRED: reads the exact same localStorage key/shape pages/index.tsx's own Library drawer restores from", async () => {
    localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify([
      { id: "local-doc-1", name: "Organic Chemistry.pdf", uploadedAt: "2026-06-10T00:00:00.000Z", localDocumentId: "uuid-1" },
    ]));
    const library = await loadUserLibrary();
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({
      documentId: "local-doc-1",
      title: "Organic Chemistry.pdf",
      isLocal: true,
      localDocumentId: "uuid-1",
      bookId: "Organic Chemistry",
    });
  });

  it("sorts most-recently-uploaded first", async () => {
    localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify([
      { id: "old", name: "Old.pdf", uploadedAt: "2026-01-01T00:00:00.000Z", localDocumentId: "uuid-old" },
      { id: "new", name: "New.pdf", uploadedAt: "2026-06-15T00:00:00.000Z", localDocumentId: "uuid-new" },
    ]));
    const library = await loadUserLibrary();
    expect(library.map((r) => r.documentId)).toEqual(["new", "old"]);
  });

  it("silently drops malformed entries instead of throwing", async () => {
    localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify([
      { id: "valid", name: "Valid.pdf", uploadedAt: "2026-01-01T00:00:00.000Z", localDocumentId: "uuid-valid" },
      { id: "", name: "Missing id", uploadedAt: "2026-01-01T00:00:00.000Z", localDocumentId: "uuid-missing" },
      { name: "Missing localDocumentId", uploadedAt: "2026-01-01T00:00:00.000Z" },
    ]));
    const library = await loadUserLibrary();
    expect(library.map((r) => r.documentId)).toEqual(["valid"]);
  });

  it("degrades to an empty array rather than throwing on corrupted JSON", async () => {
    localStorage.setItem(LOCAL_LIBRARY_KEY, "{not valid json");
    await expect(loadUserLibrary()).resolves.toEqual([]);
  });
});

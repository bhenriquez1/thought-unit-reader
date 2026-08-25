// tests/stickyNotes/stickyNoteStore.test.ts
// C1 — Reader Sticky Notes. Real behavioral tests against a minimal in-memory
// fake IndexedDB (this repo's Jest environment has no real indexedDB global —
// matching the established pattern elsewhere in this repo, e.g.
// tests/examEngine/questionCacheProvenanceBackfill.test.ts).

interface FakeRecord { id: string; [key: string]: unknown }

function installFakeIndexedDB() {
  const store = new Map<string, FakeRecord>();

  (global as unknown as { indexedDB: unknown }).indexedDB = {
    open: () => {
      const req: Record<string, unknown> = {};
      setTimeout(() => {
        req.result = {
          transaction: () => ({
            objectStore: () => ({
              clear: () => { store.clear(); },
              put: (record: FakeRecord) => { store.set(record.id, record); },
              getAll: () => {
                const getReq: Record<string, unknown> = { result: Array.from(store.values()) };
                setTimeout(() => (getReq.onsuccess as ((e: unknown) => void) | undefined)?.({ target: getReq }), 0);
                return getReq;
              },
            }),
            get oncomplete() { return undefined; },
            set oncomplete(fn: unknown) { setTimeout(() => (fn as (() => void))?.(), 0); },
          }),
          objectStoreNames: { contains: () => true },
        };
        (req.onsuccess as ((e: unknown) => void) | undefined)?.({ target: req });
      }, 0);
      return req;
    },
  };

  return store;
}

describe("lib/stickyNotes/stickyNoteStore.ts", () => {
  let mod: typeof import("@/lib/stickyNotes/stickyNoteStore");

  beforeEach(async () => {
    jest.resetModules();
    installFakeIndexedDB();
    mod = await import("@/lib/stickyNotes/stickyNoteStore");
  });

  it("REQUIRED: a created note carries documentId, pageTruthKey, and pageNumber — the real provenance model, not a filename", async () => {
    const note = await mod.createStickyNote({
      documentId: "doc-uuid-123",
      pageTruthKey: "doc-uuid-123::5::t",
      pageNumber: 5,
      text: "Ask Professor about this",
    });
    expect(note.documentId).toBe("doc-uuid-123");
    expect(note.pageTruthKey).toBe("doc-uuid-123::5::t");
    expect(note.pageNumber).toBe(5);
    expect(note.id).toBeTruthy();
    expect(note.createdAt).toBe(note.updatedAt);
  });

  it("REQUIRED: optional canonicalUnitId/knowledgeNodeId/evidence are preserved when supplied", async () => {
    const note = await mod.createStickyNote({
      documentId: "doc-1",
      pageTruthKey: "doc-1::2::t",
      pageNumber: 2,
      text: "Important for DAT",
      canonicalUnitId: "cu-1",
      knowledgeNodeId: "kn-1",
      evidence: { text: "the sodium-potassium pump", anchorType: "mechanism" },
    });
    expect(note.canonicalUnitId).toBe("cu-1");
    expect(note.knowledgeNodeId).toBe("kn-1");
    expect(note.evidence).toEqual({ text: "the sodium-potassium pump", anchorType: "mechanism" });
  });

  it("REQUIRED: getStickyNotesForDocument scopes by documentId, never bookId — two documents never leak into each other", async () => {
    await mod.createStickyNote({ documentId: "doc-a", pageTruthKey: "doc-a::1::t", pageNumber: 1, text: "note in doc A" });
    await mod.createStickyNote({ documentId: "doc-b", pageTruthKey: "doc-b::1::t", pageNumber: 1, text: "note in doc B" });

    const forA = await mod.getStickyNotesForDocument("doc-a");
    expect(forA).toHaveLength(1);
    expect(forA[0].text).toBe("note in doc A");
  });

  it("REQUIRED: getStickyNotesForPage filters to documentId AND pageNumber together", async () => {
    await mod.createStickyNote({ documentId: "doc-1", pageTruthKey: "doc-1::1::t", pageNumber: 1, text: "page 1 note" });
    await mod.createStickyNote({ documentId: "doc-1", pageTruthKey: "doc-1::2::t", pageNumber: 2, text: "page 2 note" });

    const page1 = await mod.getStickyNotesForPage("doc-1", 1);
    expect(page1).toHaveLength(1);
    expect(page1[0].text).toBe("page 1 note");
  });

  it("REQUIRED: updateStickyNoteText edits in place and bumps updatedAt without touching createdAt", async () => {
    const note = await mod.createStickyNote({ documentId: "doc-1", pageTruthKey: "doc-1::1::t", pageNumber: 1, text: "original" });
    await new Promise((r) => setTimeout(r, 2));
    await mod.updateStickyNoteText(note.id, "edited");

    const [reloaded] = await mod.getStickyNotesForDocument("doc-1");
    expect(reloaded.text).toBe("edited");
    expect(reloaded.createdAt).toBe(note.createdAt);
    expect(reloaded.updatedAt).toBeGreaterThan(note.createdAt);
  });

  it("REQUIRED: deleteStickyNote removes exactly that note, leaving others untouched", async () => {
    const a = await mod.createStickyNote({ documentId: "doc-1", pageTruthKey: "doc-1::1::t", pageNumber: 1, text: "keep me" });
    const b = await mod.createStickyNote({ documentId: "doc-1", pageTruthKey: "doc-1::1::t", pageNumber: 1, text: "delete me" });

    await mod.deleteStickyNote(b.id);

    const remaining = await mod.getStickyNotesForDocument("doc-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(a.id);
  });
});

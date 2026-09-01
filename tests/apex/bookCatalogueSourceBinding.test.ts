// tests/apex/bookCatalogueSourceBinding.test.ts
// TestLab source binding fix — "TestLab source selection must come from
// the same persistent Library/Firebase document records used by Reader."
// getUserBookCatalogue() used to build its book list entirely from
// historical UltraNote activity, ranked by note count, with no documentId
// at all — a book studied heavily weeks ago permanently outranked a
// brand-new upload as TestLab's default selection (the reported "TestLab
// keeps showing a stale previous book" bug). These are real behavioral
// tests for the rewritten function, mocking only the two IDB/Firebase-
// backed store modules it reads (same pattern as
// tests/recalllab/recall2LearningStateSignals.test.ts).

jest.mock("@/lib/library/userLibrary", () => ({ loadUserLibrary: jest.fn() }));
jest.mock("@/lib/notelab/ultraNoteStore", () => ({ getAllUltraNotesAsync: jest.fn() }));

import { getUserBookCatalogue, getLastSelectedTestLabDocumentId, setLastSelectedTestLabDocumentId } from "@/lib/apex/bookCatalogue";
import { loadUserLibrary } from "@/lib/library/userLibrary";
import { getAllUltraNotesAsync } from "@/lib/notelab/ultraNoteStore";
import type { LibraryRecord } from "@/lib/library/userLibrary";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";

const mockLoadUserLibrary = loadUserLibrary as jest.Mock;
const mockGetAllUltraNotesAsync = getAllUltraNotesAsync as jest.Mock;

function fixtureRecord(overrides: Partial<LibraryRecord> = {}): LibraryRecord {
  return {
    documentId: "doc-1", title: "Cell Biology", url: "https://example.com/a.pdf",
    uploadedAt: "2026-06-01T00:00:00.000Z", isLocal: false, bookId: "Cell Biology",
    ...overrides,
  };
}

function fixtureNote(overrides: Partial<UltraNote> = {}): UltraNote {
  return { id: "n1", bookId: "Cell Biology", pageNumber: 1, topic: "t", coreIdea: "c", concepts: [], memoryShortcuts: [], subject: "General Notes", createdAt: Date.now(), ...overrides } as UltraNote;
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe("getUserBookCatalogue", () => {
  it("REQUIRED: every entry carries the real documentId from the Library, not just bookId/title", () => {
    mockLoadUserLibrary.mockResolvedValue([fixtureRecord({ documentId: "hash-abc123", bookId: "Cell Biology", title: "Cell Biology" })]);
    mockGetAllUltraNotesAsync.mockResolvedValue([]);
    return getUserBookCatalogue().then((books) => {
      expect(books).toHaveLength(1);
      expect(books[0].documentId).toBe("hash-abc123");
    });
  });

  it("REQUIRED: a freshly uploaded book with zero notes still appears — it used to be invisible until it had notes", () => {
    mockLoadUserLibrary.mockResolvedValue([fixtureRecord({ documentId: "doc-new", title: "Brand New Upload" })]);
    mockGetAllUltraNotesAsync.mockResolvedValue([]);
    return getUserBookCatalogue().then((books) => {
      expect(books).toHaveLength(1);
      expect(books[0].bookTitle).toBe("Brand New Upload");
      expect(books[0].noteCount).toBe(0);
    });
  });

  it("REQUIRED: ordering follows the Library's own (most-recently-uploaded-first) order, never historical note count", () => {
    // Library already returns most-recent-first (loadUserLibrary's own contract) —
    // an old, heavily-annotated book must NOT be reordered ahead of a newer one.
    mockLoadUserLibrary.mockResolvedValue([
      fixtureRecord({ documentId: "doc-new", bookId: "New Upload", title: "New Upload", uploadedAt: "2026-06-15T00:00:00.000Z" }),
      fixtureRecord({ documentId: "doc-old", bookId: "Old Annotated Book", title: "Old Annotated Book", uploadedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    // "Old Annotated Book" has far more historical notes than "New Upload".
    mockGetAllUltraNotesAsync.mockResolvedValue([
      ...Array.from({ length: 50 }, (_, i) => fixtureNote({ id: `old-${i}`, bookId: "Old Annotated Book" })),
      fixtureNote({ id: "new-1", bookId: "New Upload" }),
    ]);
    return getUserBookCatalogue().then((books) => {
      expect(books.map((b) => b.documentId)).toEqual(["doc-new", "doc-old"]);
    });
  });

  it("does not leak in a 'book' that only exists as historical note activity with no Library record", () => {
    mockLoadUserLibrary.mockResolvedValue([]);
    mockGetAllUltraNotesAsync.mockResolvedValue([fixtureNote({ bookId: "Orphaned Notes Only" })]);
    return getUserBookCatalogue().then((books) => {
      expect(books).toHaveLength(0);
    });
  });

  it("a deleted Library book disappears immediately, even if it still has historical notes", () => {
    mockLoadUserLibrary.mockResolvedValue([fixtureRecord({ documentId: "doc-survivor", bookId: "Survivor", title: "Survivor" })]);
    mockGetAllUltraNotesAsync.mockResolvedValue([
      fixtureNote({ bookId: "Survivor" }),
      fixtureNote({ bookId: "Deleted Book" }),
    ]);
    return getUserBookCatalogue().then((books) => {
      expect(books.map((b) => b.bookId)).toEqual(["Survivor"]);
    });
  });
});

describe("last-selected TestLab documentId persistence", () => {
  // These functions guard on `typeof window === "undefined"` (matching
  // this file's existing setSubjectOverride/getSubjectOverride
  // convention) — correct for real SSR, but this suite's jest
  // environment is "node" (no window global at all), unlike the real
  // "use client" browser context these run in. Stub it here, scoped to
  // just this describe block, rather than weakening the guard itself.
  const originalWindow = (global as any).window;
  beforeAll(() => { (global as any).window = global; });
  afterAll(() => { (global as any).window = originalWindow; });

  it("round-trips through localStorage", () => {
    expect(getLastSelectedTestLabDocumentId()).toBeNull();
    setLastSelectedTestLabDocumentId("doc-123");
    expect(getLastSelectedTestLabDocumentId()).toBe("doc-123");
  });

  it("clearing with null removes the stored value rather than storing the literal string 'null'", () => {
    setLastSelectedTestLabDocumentId("doc-123");
    setLastSelectedTestLabDocumentId(null);
    expect(getLastSelectedTestLabDocumentId()).toBeNull();
  });
});

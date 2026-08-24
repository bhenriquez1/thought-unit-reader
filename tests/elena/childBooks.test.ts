// tests/elena/childBooks.test.ts
// Pure-logic coverage for lib/elena/childBooks.ts — E2 (Elena foundation).
// The IDB-touching functions (uploadChildBook, loadChildBookFileUrl,
// recordBookOpened, updateBookProgress) are covered by static-analysis
// assertions elsewhere (this repo's Node test env has no indexedDB global,
// matching the established pattern in tests/knowledge/whiteboardLessonSnapshotStore.test.ts).

import {
  deriveBookTitle,
  buildChildLibraryEntry,
  mergeLibraryEntryProgress,
  isNewlyCompleted,
  pickMostRecentEntry,
} from "@/lib/elena/childBooks";
import type { ChildLibraryEntry } from "@/lib/elena/types";

describe("deriveBookTitle", () => {
  it("strips a .pdf extension", () => {
    expect(deriveBookTitle("Charlottes Web.pdf")).toBe("Charlottes Web");
  });

  it("is case-insensitive about the extension", () => {
    expect(deriveBookTitle("story.PDF")).toBe("story");
  });

  it("falls back to 'Untitled book' for an empty/whitespace name", () => {
    expect(deriveBookTitle("   ")).toBe("Untitled book");
    expect(deriveBookTitle(".pdf")).toBe("Untitled book");
  });

  it("clamps very long titles to 120 chars", () => {
    const long = "a".repeat(200) + ".pdf";
    expect(deriveBookTitle(long).length).toBe(120);
  });
});

describe("buildChildLibraryEntry", () => {
  it("REQUIRED: composite id is `${childProfileId}::${documentId}` — keeps reading position per child, not per book", () => {
    const entry = buildChildLibraryEntry("Dragons.pdf", "doc-1", "child-1", "2026-08-15T00:00:00.000Z");
    expect(entry.id).toBe("child-1::doc-1");
  });

  it("starts at page 1 with totalPages 0 (unknown until the viewer reports it)", () => {
    const entry = buildChildLibraryEntry("Dragons.pdf", "doc-1", "child-1", "2026-08-15T00:00:00.000Z");
    expect(entry.currentPage).toBe(1);
    expect(entry.totalPages).toBe(0);
  });

  it("addedAt/updatedAt/lastOpenedAt all equal the given timestamp for a fresh upload", () => {
    const now = "2026-08-15T00:00:00.000Z";
    const entry = buildChildLibraryEntry("Dragons.pdf", "doc-1", "child-1", now);
    expect(entry.addedAt).toBe(now);
    expect(entry.updatedAt).toBe(now);
    expect(entry.lastOpenedAt).toBe(now);
  });
});

describe("mergeLibraryEntryProgress", () => {
  const base: ChildLibraryEntry = {
    id: "child-1::doc-1", childProfileId: "child-1", documentId: "doc-1",
    title: "Dragons", totalPages: 20, currentPage: 3,
    addedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", lastOpenedAt: "2026-08-01T00:00:00.000Z",
  };

  it("updates currentPage and bumps updatedAt", () => {
    const merged = mergeLibraryEntryProgress(base, { currentPage: 7 }, "2026-08-15T00:00:00.000Z");
    expect(merged.currentPage).toBe(7);
    expect(merged.totalPages).toBe(20);
    expect(merged.updatedAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("updates totalPages independently of currentPage", () => {
    const merged = mergeLibraryEntryProgress(base, { totalPages: 42 }, "2026-08-15T00:00:00.000Z");
    expect(merged.totalPages).toBe(42);
    expect(merged.currentPage).toBe(3);
  });

  it("leaves fields unset in the patch unchanged", () => {
    const merged = mergeLibraryEntryProgress(base, {}, "2026-08-15T00:00:00.000Z");
    expect(merged.currentPage).toBe(base.currentPage);
    expect(merged.totalPages).toBe(base.totalPages);
  });

  it("does not mutate the input entry", () => {
    mergeLibraryEntryProgress(base, { currentPage: 99 }, "2026-08-15T00:00:00.000Z");
    expect(base.currentPage).toBe(3);
  });

  it("REQUIRED: stamps completedAt the first time currentPage reaches totalPages", () => {
    const merged = mergeLibraryEntryProgress(base, { currentPage: 20 }, "2026-08-15T00:00:00.000Z");
    expect(merged.completedAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("REQUIRED: also completes when currentPage overshoots totalPages (e.g. a last short page), not just an exact match", () => {
    const merged = mergeLibraryEntryProgress(base, { currentPage: 25 }, "2026-08-15T00:00:00.000Z");
    expect(merged.completedAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("does not stamp completedAt while short of the last page", () => {
    const merged = mergeLibraryEntryProgress(base, { currentPage: 19 }, "2026-08-15T00:00:00.000Z");
    expect(merged.completedAt).toBeUndefined();
  });

  it("REQUIRED: never re-stamps or clears completedAt once set — paging backward afterward doesn't 'uncomplete' a finished book", () => {
    const finished: ChildLibraryEntry = { ...base, currentPage: 20, completedAt: "2026-08-10T00:00:00.000Z" };
    const merged = mergeLibraryEntryProgress(finished, { currentPage: 5 }, "2026-08-15T00:00:00.000Z");
    expect(merged.completedAt).toBe("2026-08-10T00:00:00.000Z");
  });

  it("does not complete a book whose totalPages is still unknown (0)", () => {
    const unknownLength: ChildLibraryEntry = { ...base, totalPages: 0 };
    const merged = mergeLibraryEntryProgress(unknownLength, { currentPage: 500 }, "2026-08-15T00:00:00.000Z");
    expect(merged.completedAt).toBeUndefined();
  });
});

describe("isNewlyCompleted", () => {
  const base: ChildLibraryEntry = {
    id: "child-1::doc-1", childProfileId: "child-1", documentId: "doc-1",
    title: "Dragons", totalPages: 20, currentPage: 3,
    addedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", lastOpenedAt: "2026-08-01T00:00:00.000Z",
  };

  it("REQUIRED: true when the update is the one that just set completedAt", () => {
    const updated = mergeLibraryEntryProgress(base, { currentPage: 20 }, "2026-08-15T00:00:00.000Z");
    expect(isNewlyCompleted(base, updated)).toBe(true);
  });

  it("REQUIRED: false when the book was already complete before this update — prevents double-counting on re-reads", () => {
    const alreadyDone: ChildLibraryEntry = { ...base, currentPage: 20, completedAt: "2026-08-10T00:00:00.000Z" };
    const updated = mergeLibraryEntryProgress(alreadyDone, { currentPage: 5 }, "2026-08-15T00:00:00.000Z");
    expect(isNewlyCompleted(alreadyDone, updated)).toBe(false);
  });

  it("false when neither the previous nor the updated entry is complete", () => {
    const updated = mergeLibraryEntryProgress(base, { currentPage: 10 }, "2026-08-15T00:00:00.000Z");
    expect(isNewlyCompleted(base, updated)).toBe(false);
  });
});

describe("pickMostRecentEntry", () => {
  function entry(id: string, lastOpenedAt: string): ChildLibraryEntry {
    return {
      id, childProfileId: "child-1", documentId: id, title: id,
      totalPages: 10, currentPage: 1, addedAt: lastOpenedAt, updatedAt: lastOpenedAt, lastOpenedAt,
    };
  }

  it("returns null for an empty library", () => {
    expect(pickMostRecentEntry([])).toBeNull();
  });

  it("REQUIRED: returns the entry with the latest lastOpenedAt — 'resume' means the most recently opened book, not the most recently added one", () => {
    const entries = [
      entry("a", "2026-08-10T00:00:00.000Z"),
      entry("b", "2026-08-15T00:00:00.000Z"),
      entry("c", "2026-08-01T00:00:00.000Z"),
    ];
    expect(pickMostRecentEntry(entries)?.id).toBe("b");
  });

  it("returns the sole entry when there is only one", () => {
    const entries = [entry("only", "2026-08-15T00:00:00.000Z")];
    expect(pickMostRecentEntry(entries)?.id).toBe("only");
  });
});

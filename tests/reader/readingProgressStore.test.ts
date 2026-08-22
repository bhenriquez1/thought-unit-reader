// tests/reader/readingProgressStore.test.ts
// lib/reader/readingProgressStore.ts is IDB-backed, so its I/O functions
// (recordPageReached/getReadingProgress) aren't exercised here — this repo's
// Jest config has no IndexedDB shim (see other IDB-store tests' own header
// comments for the same constraint). todaysFurthestPage IS pure (takes a
// record, returns a value, no I/O) and is covered behaviorally below.

import { todaysFurthestPage } from "@/lib/reader/readingProgressStore";
import type { ReadingProgressRecord } from "@/lib/reader/readingProgressStore";

function record(dailyMaxPage: { date: string; maxPage: number }[]): ReadingProgressRecord {
  return { bookId: "book1", furthestPageReached: 200, lastPageRead: 200, dailyMaxPage, updatedAt: "2026-08-22T00:00:00.000Z" };
}

describe("todaysFurthestPage", () => {
  it("returns today's max page when an entry for today exists", () => {
    const r = record([{ date: "2026-08-21", maxPage: 80 }, { date: "2026-08-22", maxPage: 95 }]);
    expect(todaysFurthestPage(r, "2026-08-22T18:00:00.000Z")).toBe(95);
  });

  it("returns null when nothing was read today — even if furthestPageReached overall is high", () => {
    const r = record([{ date: "2026-08-20", maxPage: 200 }]);
    expect(todaysFurthestPage(r, "2026-08-22T18:00:00.000Z")).toBeNull();
  });

  it("returns null for a null record", () => {
    expect(todaysFurthestPage(null, "2026-08-22T18:00:00.000Z")).toBeNull();
  });

  it("uses the local calendar date (YYYY-MM-DD slice), not the full timestamp", () => {
    const r = record([{ date: "2026-08-22", maxPage: 50 }]);
    expect(todaysFurthestPage(r, "2026-08-22T23:59:59.999Z")).toBe(50);
  });
});

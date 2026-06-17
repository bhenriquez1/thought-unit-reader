// lib/syllabus/pageVisitStore.ts
//
// Tracks which PDF pages have actually been visited, per book — the basis for
// Syllabus's chapter-level "Read %". There was no durable page-visit signal
// before this (pages/index.tsx's `sessionPagesVisited` is in-memory and
// session-only, never persisted), so chapter progress had nothing to read
// "reading" from.

const LS_KEY = "syllabus_page_visits_v1";

type VisitMap = Record<string, number[]>; // bookId -> sorted unique page numbers

function readAll(): VisitMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: VisitMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    // Best-effort — losing a visit record only degrades a % display, never data integrity.
  }
}

export function recordPageVisit(bookId: string, pageNumber: number): void {
  if (!bookId || !Number.isFinite(pageNumber) || pageNumber < 1) return;
  const all = readAll();
  const pages = new Set(all[bookId] ?? []);
  if (pages.has(pageNumber)) return;
  pages.add(pageNumber);
  all[bookId] = Array.from(pages).sort((a, b) => a - b);
  writeAll(all);
}

export function getVisitedPages(bookId: string): Set<number> {
  const all = readAll();
  return new Set(all[bookId] ?? []);
}

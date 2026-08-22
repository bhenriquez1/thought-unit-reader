// lib/reader/readingProgressStore.ts
// TestLab-Reader progress integration — "how far has the student actually
// read in Avrrio Reader" had no durable signal anywhere before this file.
// lib/db/documentStore.ts only stores the PDF binary/title; the per-unit
// interaction log in lib/reader/thoughtUnitProgress.ts tracks which
// Thought Units were focused/mastered, not reading POSITION, and isn't
// necessarily monotonic (a student can jump around). TestLab's exam-scope
// selector (buildExam's chapterPageRanges) needs a simple, monotonic
// checkpoint: the furthest page this student has actually reached, so a
// "Completed material only" exam can never draw on unread chapters.
//
// This mirrors the shape lib/elena/childBooks.ts already uses for Elena's
// own per-book currentPage/totalPages tracking — same idea, adult-Reader
// side. Keyed by bookId (UltraNote.bookId / CatalogueBook.bookId), NOT the
// separately-resolved documentId knowledgeGraphStore.ts uses — TestLab's
// book catalogue and examBuilder.ts's own canonical-unit lookups already
// key everything off bookId, so this store has to match or TestLab could
// never look its own checkpoint back up. Not a second parser/pipeline — a
// checkpoint store, orthogonal to Thought Units / Knowledge Graph /
// Learning State, which TestLab still reads through their own canonical
// engines for actual content.

const DB_NAME    = "avrrio-reading-progress";
const DB_VERSION = 1;
const STORE      = "progress";

/** How many calendar days of dailyMaxPage history to retain — enough for
 *  "today's reading" and a short recent-activity view, not an unbounded log. */
const MAX_DAILY_ENTRIES = 60;

export interface DailyProgressEntry {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  maxPage: number;
}

export interface ReadingProgressRecord {
  bookId: string;
  furthestPageReached: number;
  lastPageRead: number;
  dailyMaxPage: DailyProgressEntry[];
  updatedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "bookId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("readingProgressStore: IDB blocked — close other tabs"));
  });
}

export async function getReadingProgress(bookId: string): Promise<ReadingProgressRecord | null> {
  if (!bookId) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(bookId);
    req.onsuccess = () => resolve((req.result as ReadingProgressRecord) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function putReadingProgress(record: ReadingProgressRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function localDate(iso: string): string {
  return iso.split("T")[0];
}

function bumpDailyMaxPage(entries: DailyProgressEntry[], date: string, page: number): DailyProgressEntry[] {
  const idx = entries.findIndex(e => e.date === date);
  let next: DailyProgressEntry[];
  if (idx === -1) {
    next = [...entries, { date, maxPage: page }];
  } else {
    next = entries.slice();
    next[idx] = { date, maxPage: Math.max(next[idx].maxPage, page) };
  }
  return next.slice(-MAX_DAILY_ENTRIES);
}

/** Records that the student reached `page` in `bookId` right now.
 *  Fire-and-forget from callers — a failed write must never block reading.
 *  `occurredAt` is injectable (defaults to now) for deterministic tests. */
export async function recordPageReached(
  bookId: string,
  page: number,
  occurredAt: string = new Date().toISOString(),
): Promise<void> {
  if (!bookId || !Number.isFinite(page) || page < 1) return;
  const existing = await getReadingProgress(bookId);
  const date = localDate(occurredAt);
  const record: ReadingProgressRecord = existing
    ? {
        ...existing,
        furthestPageReached: Math.max(existing.furthestPageReached, page),
        lastPageRead: page,
        dailyMaxPage: bumpDailyMaxPage(existing.dailyMaxPage, date, page),
        updatedAt: occurredAt,
      }
    : {
        bookId,
        furthestPageReached: page,
        lastPageRead: page,
        dailyMaxPage: [{ date, maxPage: page }],
        updatedAt: occurredAt,
      };
  await putReadingProgress(record);
}

/** Furthest page reached today (local date), or null if nothing was read
 *  today — the signal behind TestLab's "Today's reading" exam scope. */
export function todaysFurthestPage(record: ReadingProgressRecord | null, now: string = new Date().toISOString()): number | null {
  if (!record) return null;
  const today = localDate(now);
  const entry = record.dailyMaxPage.find(e => e.date === today);
  return entry ? entry.maxPage : null;
}

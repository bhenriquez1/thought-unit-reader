// lib/highlights/savedHighlightsStore.ts
// IDB-first storage for highlights produced by RightPanel "Save to NoteLab" /
// "Save to Recall" actions. Mirrors the studyplan/notelab/recalllab persistence
// pattern: IDB primary, localStorage mirror/fallback, bookId-scoped.
//
// These records let the LeftPanel render a persistent highlight for the source
// material that backed a saved note/recall item, independent of the ephemeral
// per-synthesis `currentPageStudyModel`.

const DB_NAME = "avrrio_highlights_v1";
const STORE = "savedHighlights";
const LS_KEY = "savedHighlights_v1";

export interface SavedHighlight {
  id: string;
  bookId: string;
  page: number;          // 1-based, matches pageTextByPage keys
  text: string;          // anchor.exactText — verbatim source span
  anchorType: string;    // VisualAnchorRole, e.g. "coreIdea"
  reason: string;
  sourceType: "note" | "recall";
  sourceRefId: string;   // UltraNote id or RecallSet id
  createdAt: number;
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openHighlightsIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPutAll<T extends { id: string }>(records: T[]): Promise<void> {
  const db = await openHighlightsIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    os.clear();
    for (const r of records) os.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGetAll<T>(): Promise<T[]> {
  const db = await openHighlightsIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── Generic load/save ───────────────────────────────────────────────────────

async function loadAll(): Promise<SavedHighlight[]> {
  if (typeof window === "undefined") return [];
  try {
    const idbRecords = await idbGetAll<SavedHighlight>();
    if (idbRecords.length > 0) {
      console.log(`[SAVED_HIGHLIGHTS_STORAGE_DRIVER]`, { driver: "indexeddb", count: idbRecords.length });
      return idbRecords.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch (e) { console.warn(`[SAVED_HIGHLIGHTS_IDB_LOAD_FAIL]`, { error: String(e) }); }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const lsRecords: SavedHighlight[] = Array.isArray(parsed) ? parsed : [];
    if (lsRecords.length > 0) {
      console.log(`[SAVED_HIGHLIGHTS_STORAGE_DRIVER]`, { driver: "localstorage-migration", count: lsRecords.length });
      idbPutAll(lsRecords).catch(() => {});
    }
    return lsRecords.sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

async function saveAll(records: SavedHighlight[]): Promise<void> {
  const capped = records.slice(0, 200);
  try {
    await idbPutAll(capped);
    console.log(`[SAVED_HIGHLIGHTS_SAVE_SUCCESS]`, { driver: "indexeddb", count: capped.length });
  } catch (idbErr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(capped));
      console.log(`[SAVED_HIGHLIGHTS_SAVE_SUCCESS]`, { driver: "localstorage", count: capped.length });
    } catch (lsErr) {
      throw new Error(`Saved highlights storage failed — IDB: ${String(idbErr)} / LS: ${String(lsErr)}`);
    }
  }
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function genId(): string {
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function saveHighlightsForPage(
  bookId: string,
  page: number,
  anchors: { text: string; anchorType: string; reason: string }[],
  sourceType: "note" | "recall",
  sourceRefId: string,
): Promise<void> {
  const existing = await loadAll();
  const samePage = existing.filter(h => h.bookId === bookId && h.page === page);
  const existingNormalized = new Set(samePage.map(h => normalizeText(h.text)));

  const now = Date.now();
  const fresh: SavedHighlight[] = [];
  for (const a of anchors) {
    if (!a.text || !a.text.trim()) continue;
    const norm = normalizeText(a.text);
    if (existingNormalized.has(norm)) continue;
    existingNormalized.add(norm);
    fresh.push({
      id: genId(),
      bookId,
      page,
      text: a.text,
      anchorType: a.anchorType,
      reason: a.reason,
      sourceType,
      sourceRefId,
      createdAt: now,
    });
  }

  if (fresh.length === 0) return;
  await saveAll([...fresh, ...existing]);
}

export async function getHighlightsForPage(bookId: string, page: number): Promise<SavedHighlight[]> {
  const all = await loadAll();
  return all.filter(h => h.bookId === bookId && h.page === page);
}

export async function getHighlightsByBook(bookId: string): Promise<SavedHighlight[]> {
  const all = await loadAll();
  return all.filter(h => h.bookId === bookId);
}

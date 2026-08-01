// lib/recalllab/recall2Store.ts
// IDB-primary store for RecallBlueprint objects.
// Separate from avrrio_recall_v2 — existing RecallSets are untouched.

import type { RecallBlueprint, RecallCategory } from "./recall2Types";

const DB_NAME    = "avrrio_recall2_v1";
const STORE_NAME = "blueprints";
const LS_KEY     = "recall2_mirror_v1";

// ── Deterministic ID helpers ──────────────────────────────────────────────

/** djb2 hash → base36 string — stable, no btoa needed. */
export function canonicalHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (((h << 5) + h) ^ text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function newBlueprint(
  front: string,
  back: string,
  category: RecallCategory,
  opts: {
    bookId: string;
    pageNumber?: number;
    canonicalUnitId?: string;
    sourceLabel?: string;
    hint?: string;
    learningObjective?: string;
  },
): RecallBlueprint {
  const today = isoToday();
  return {
    id:                  `bp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    bookId:              opts.bookId,
    pageNumber:          opts.pageNumber,
    category,
    front,
    back,
    hint:                opts.hint,
    learningObjective:   opts.learningObjective,
    sourceLabel:         opts.sourceLabel,
    canonicalUnitId:     opts.canonicalUnitId,
    canonicalHash:       canonicalHash(front.toLowerCase().slice(0, 120)),
    interval:            1,
    easeFactor:          2.5,
    dueDate:             today,
    reviewCount:         0,
    consecutiveCorrect:  0,
    confidenceHistory:   [],
    createdAt:           today,
  };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── IDB ───────────────────────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("bookId",  "bookId",  { unique: false });
        store.createIndex("dueDate", "dueDate", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB blocked"));
  });
}

async function idbPut(bp: RecallBlueprint): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(bp);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbPutAll(bps: RecallBlueprint[]): Promise<void> {
  if (bps.length === 0) return;
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    bps.forEach(bp => store.put(bp));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGetAll(): Promise<RecallBlueprint[]> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as RecallBlueprint[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetByBookId(bookId: string): Promise<RecallBlueprint[]> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("bookId");
    const req   = index.getAll(bookId);
    req.onsuccess = () => resolve((req.result as RecallBlueprint[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── localStorage mirror (sync read, best-effort write) ────────────────────

function lsRead(): RecallBlueprint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function lsWrite(bps: RecallBlueprint[]): void {
  if (typeof window === "undefined") return;
  try {
    // Mirror is a capped, trimmed snapshot for instant-read on next mount
    const mirror = bps.slice(0, 200).map(bp => ({
      ...bp,
      front: bp.front.slice(0, 160),
      back:  bp.back.slice(0, 200),
      confidenceHistory: bp.confidenceHistory.slice(-5),
    }));
    localStorage.setItem(LS_KEY, JSON.stringify(mirror));
  } catch { /* quota exceeded — ignore */ }
}

function notifyUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("recall2-updated"));
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/** Sync read from localStorage mirror — use for instant initial render. */
export function getBlueprints(bookId?: string): RecallBlueprint[] {
  const all = lsRead();
  return bookId ? all.filter(bp => bp.bookId === bookId) : all;
}

/** Async read from IDB (authoritative). */
export async function getBlueprintsAsync(bookId?: string): Promise<RecallBlueprint[]> {
  const all = bookId ? await idbGetByBookId(bookId) : await idbGetAll();
  lsWrite(all);
  return all;
}

/** Save a single blueprint (upsert). */
export async function saveBlueprint(bp: RecallBlueprint): Promise<void> {
  await idbPut(bp);
  const all = await idbGetAll();
  lsWrite(all);
  notifyUpdate();
}

/** Save multiple blueprints (bulk upsert), deduplicating by canonicalHash within the batch. */
export async function saveBlueprintsDedup(
  incoming: RecallBlueprint[],
  bookId: string,
): Promise<{ saved: number; skipped: number }> {
  const existing = await idbGetByBookId(bookId);
  const existingHashes = new Set(existing.map(bp => bp.canonicalHash));

  const toSave = incoming.filter(bp => !existingHashes.has(bp.canonicalHash));
  await idbPutAll(toSave);

  const all = await idbGetAll();
  lsWrite(all);
  notifyUpdate();
  return { saved: toSave.length, skipped: incoming.length - toSave.length };
}

/** Update a blueprint after a rating. */
export async function updateBlueprint(bp: RecallBlueprint): Promise<void> {
  await idbPut(bp);
  const all = await idbGetAll();
  lsWrite(all);
  // No notifyUpdate — session updates are handled locally for performance
}

/** Flush updated blueprints from a completed session back to IDB. */
export async function flushSessionResults(updated: RecallBlueprint[]): Promise<void> {
  await idbPutAll(updated);
  const all = await idbGetAll();
  lsWrite(all);
  notifyUpdate();
}

/** Delete a blueprint by id. */
export async function deleteBlueprint(id: string): Promise<void> {
  await idbDelete(id);
  const all = await idbGetAll();
  lsWrite(all);
  notifyUpdate();
}

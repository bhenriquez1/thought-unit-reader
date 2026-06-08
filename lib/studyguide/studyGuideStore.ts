// lib/studyguide/studyGuideStore.ts
// IDB-first storage for Study Guide Lab. Mirrors the notelab/recalllab pattern exactly.

import type { StudyGuideRecord } from "./types";

const DB_NAME    = "avrrio_studyguide_v1";
const DB_STORE   = "guides";
const STORAGE_KEY = "studyGuides_v1";
const IDB_FLAG_KEY = "studyGuides_in_idb";

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openGuideIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveGuidesToIDB(guides: StudyGuideRecord[]): Promise<void> {
  const db = await openGuideIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    // Clear and rewrite (keeps IDB consistent with in-memory state)
    store.clear();
    for (const g of guides) store.put(g);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function loadGuidesFromIDB(): Promise<StudyGuideRecord[]> {
  const db = await openGuideIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve((req.result as StudyGuideRecord[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

async function loadAllAsync(): Promise<StudyGuideRecord[]> {
  if (typeof window === "undefined") return [];
  try {
    const idbGuides = await loadGuidesFromIDB();
    if (idbGuides.length > 0) {
      console.log("[STUDYGUIDE_STORAGE_DRIVER]", { driver: "indexeddb", count: idbGuides.length });
      return idbGuides.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch (e) { console.warn("[STUDYGUIDE_IDB_LOAD_FAIL]", String(e)); }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const lsGuides: StudyGuideRecord[] = Array.isArray(parsed) ? parsed : [];
    if (lsGuides.length > 0) {
      console.log("[STUDYGUIDE_STORAGE_DRIVER]", { driver: "localstorage-migration", count: lsGuides.length });
      saveGuidesToIDB(lsGuides)
        .then(() => { try { localStorage.setItem(IDB_FLAG_KEY, "1"); } catch {} })
        .catch(() => {});
    }
    return lsGuides.sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

async function saveAll(guides: StudyGuideRecord[]): Promise<"indexeddb" | "localstorage"> {
  const serialized = JSON.stringify(guides.slice(0, 100));
  try {
    await saveGuidesToIDB(guides.slice(0, 100));
    try { localStorage.setItem(IDB_FLAG_KEY, "1"); } catch {}
    console.log("[STUDYGUIDE_SAVE_SUCCESS]", { driver: "indexeddb", count: guides.length });
    return "indexeddb";
  } catch (idbErr) {
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      try { localStorage.removeItem(IDB_FLAG_KEY); } catch {}
      return "localstorage";
    } catch (lsErr) {
      throw new Error(`Study Guide storage failed — IDB: ${String(idbErr)} / LS: ${String(lsErr)}`);
    }
  }
}

export async function saveStudyGuide(guide: StudyGuideRecord): Promise<void> {
  const existing = await loadAllAsync();
  const others = existing.filter(g => g.id !== guide.id);
  const guides = [guide, ...others];
  const driver = await saveAll(guides);

  // Read-back verification
  const saved = await loadAllAsync();
  const ok = saved.some(g => g.id === guide.id);
  if (!ok) {
    throw new Error(`Study Guide was written but could not be read back (driver=${driver}). Storage may be full.`);
  }
  console.log("[STUDYGUIDE_SAVE_VERIFIED]", { id: guide.id, driver, savedCount: saved.length });
}

export async function getAllStudyGuides(): Promise<StudyGuideRecord[]> {
  return loadAllAsync();
}

export async function deleteStudyGuide(id: string): Promise<void> {
  const existing = await loadAllAsync();
  const filtered = existing.filter(g => g.id !== id);
  await saveAll(filtered);
  console.log("[STUDYGUIDE_DELETE]", { id, remaining: filtered.length });
}

export async function getStudyGuidesByBook(bookId: string): Promise<StudyGuideRecord[]> {
  const all = await loadAllAsync();
  return all.filter(g => g.bookId === bookId);
}

// lib/studyplan/studyPlanStore.ts
// IDB-first storage for the diagnostic-based Study Plan Lab. Mirrors the
// notelab/recalllab/studyguide persistence pattern: IDB primary, localStorage
// mirror/fallback. Diagnostics and plans are stored per bookId so switching
// documents shows the correct study plan for that book, not a global plan.

import type { DiagnosticAttempt, StudyPlanRecord } from "./types";

const DB_NAME   = "avrrio_studyplan_v1";
const DIAG_STORE = "diagnostics";
const PLAN_STORE = "plans";

const DIAG_LS_KEY = "studyPlanDiagnostics_v1";
const PLAN_LS_KEY = "studyPlanRecords_v1";

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openStudyPlanIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DIAG_STORE)) {
        db.createObjectStore(DIAG_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PLAN_STORE)) {
        db.createObjectStore(PLAN_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPutAll<T extends { id: string }>(store: string, records: T[]): Promise<void> {
  const db = await openStudyPlanIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    os.clear();
    for (const r of records) os.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openStudyPlanIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── Generic load/save ───────────────────────────────────────────────────────

async function loadAll<T extends { id: string; createdAt: number }>(
  store: string, lsKey: string, label: string,
): Promise<T[]> {
  if (typeof window === "undefined") return [];
  try {
    const idbRecords = await idbGetAll<T>(store);
    if (idbRecords.length > 0) {
      console.log(`[STUDYPLAN_STORAGE_DRIVER]`, { label, driver: "indexeddb", count: idbRecords.length });
      return idbRecords.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch (e) { console.warn(`[STUDYPLAN_IDB_LOAD_FAIL]`, { label, error: String(e) }); }
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const lsRecords: T[] = Array.isArray(parsed) ? parsed : [];
    if (lsRecords.length > 0) {
      console.log(`[STUDYPLAN_STORAGE_DRIVER]`, { label, driver: "localstorage-migration", count: lsRecords.length });
      idbPutAll(store, lsRecords).catch(() => {});
    }
    return lsRecords.sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

async function saveAll<T extends { id: string }>(
  store: string, lsKey: string, label: string, records: T[],
): Promise<void> {
  const capped = records.slice(0, 100);
  try {
    await idbPutAll(store, capped);
    console.log(`[STUDYPLAN_SAVE_SUCCESS]`, { label, driver: "indexeddb", count: capped.length });
  } catch (idbErr) {
    try {
      localStorage.setItem(lsKey, JSON.stringify(capped));
    } catch (lsErr) {
      throw new Error(`Study Plan storage failed (${label}) — IDB: ${String(idbErr)} / LS: ${String(lsErr)}`);
    }
  }
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export async function saveDiagnosticAttempt(attempt: DiagnosticAttempt): Promise<void> {
  const existing = await loadAll<DiagnosticAttempt>(DIAG_STORE, DIAG_LS_KEY, "diagnostics");
  const others = existing.filter(d => d.id !== attempt.id);
  await saveAll(DIAG_STORE, DIAG_LS_KEY, "diagnostics", [attempt, ...others]);
}

export async function getDiagnosticsByBook(bookId: string): Promise<DiagnosticAttempt[]> {
  const all = await loadAll<DiagnosticAttempt>(DIAG_STORE, DIAG_LS_KEY, "diagnostics");
  return all.filter(d => d.bookId === bookId);
}

export async function deleteDiagnosticAttempt(id: string): Promise<void> {
  const existing = await loadAll<DiagnosticAttempt>(DIAG_STORE, DIAG_LS_KEY, "diagnostics");
  await saveAll(DIAG_STORE, DIAG_LS_KEY, "diagnostics", existing.filter(d => d.id !== id));
}

// ── Study Plans ──────────────────────────────────────────────────────────────

export async function saveStudyPlan(plan: StudyPlanRecord): Promise<void> {
  const existing = await loadAll<StudyPlanRecord>(PLAN_STORE, PLAN_LS_KEY, "plans");
  const others = existing.filter(p => p.id !== plan.id);
  await saveAll(PLAN_STORE, PLAN_LS_KEY, "plans", [plan, ...others]);
}

export async function getStudyPlansByBook(bookId: string): Promise<StudyPlanRecord[]> {
  const all = await loadAll<StudyPlanRecord>(PLAN_STORE, PLAN_LS_KEY, "plans");
  return all.filter(p => p.bookId === bookId);
}

export async function deleteStudyPlan(id: string): Promise<void> {
  const existing = await loadAll<StudyPlanRecord>(PLAN_STORE, PLAN_LS_KEY, "plans");
  await saveAll(PLAN_STORE, PLAN_LS_KEY, "plans", existing.filter(p => p.id !== id));
}

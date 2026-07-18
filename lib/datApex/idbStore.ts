// lib/datApex/idbStore.ts
// IndexedDB persistence for DAT Apex attempts, results, and readiness state.
// DB: "avrrio-dat-apex"  version 1
//
// Stores:
//   attempts   — DatAttempt records keyed by id
//   readiness  — DatReadinessState keyed by userId (one record per user)

import type { DatAttempt, DatReadinessState } from "./types";

const DB_NAME      = "avrrio-dat-apex";
const DB_VERSION   = 1;
const STORE_ATTEMPTS  = "attempts";
const STORE_READINESS = "readiness";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
        db.createObjectStore(STORE_ATTEMPTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_READINESS)) {
        db.createObjectStore(STORE_READINESS, { keyPath: "userId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ─── Attempts ─────────────────────────────────────────────────────────────── */

export async function saveAttempt(attempt: DatAttempt): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_ATTEMPTS, "readwrite");
  const req = tx.objectStore(STORE_ATTEMPTS).put(attempt);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadAttempt(id: string): Promise<DatAttempt | null> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_ATTEMPTS, "readonly");
  const req = tx.objectStore(STORE_ATTEMPTS).get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as DatAttempt) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function listAttempts(): Promise<DatAttempt[]> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_ATTEMPTS, "readonly");
  const req = tx.objectStore(STORE_ATTEMPTS).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as DatAttempt[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteAttempt(id: string): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_ATTEMPTS, "readwrite");
  const req = tx.objectStore(STORE_ATTEMPTS).delete(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

/* ─── Readiness state ──────────────────────────────────────────────────────── */

export async function saveReadinessState(state: DatReadinessState): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_READINESS, "readwrite");
  const req = tx.objectStore(STORE_READINESS).put(state);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadReadinessState(userId: string): Promise<DatReadinessState | null> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_READINESS, "readonly");
  const req = tx.objectStore(STORE_READINESS).get(userId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as DatReadinessState) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

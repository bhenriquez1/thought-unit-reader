// lib/elena/idbStore.ts
// IndexedDB persistence for Elena Mode child profiles and progress.
// DB: "avrrio-elena"  version 2
//
// Stores:
//   child-profiles  — ChildProfile records keyed by id
//   progress        — ChildProgress keyed by childProfileId
//   reward-state    — ChildRewardState keyed by childProfileId
//   vocabulary      — VocabWord records keyed by id, indexed by childProfileId

import type { ChildProfile, ChildProgress, ChildRewardState } from "./types";
import type { VocabWord } from "./vocabulary";

const DB_NAME        = "avrrio-elena";
const DB_VERSION     = 2;
const STORE_PROFILES = "child-profiles";
const STORE_PROGRESS = "progress";
const STORE_REWARDS  = "reward-state";
const STORE_VOCAB    = "vocabulary";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        db.createObjectStore(STORE_PROFILES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
        db.createObjectStore(STORE_PROGRESS, { keyPath: "childProfileId" });
      }
      if (!db.objectStoreNames.contains(STORE_REWARDS)) {
        db.createObjectStore(STORE_REWARDS, { keyPath: "childProfileId" });
      }
      if (!db.objectStoreNames.contains(STORE_VOCAB)) {
        const vocabStore = db.createObjectStore(STORE_VOCAB, { keyPath: "id" });
        vocabStore.createIndex("byChild", "childProfileId", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Close this connection if another tab opens a newer version, preventing
      // it from blocking that tab's upgrade indefinitely.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror   = () => reject(req.error);
    // Fired when another tab holds a v1 connection open. Reloading that tab
    // will close the connection so the upgrade can proceed.
    req.onblocked = () => console.warn("[IDB] upgrade blocked by an open connection in another tab");
  });
}

/* ─── Child profiles ─────────────────────────────────────────────────────────── */

export async function saveChildProfile(profile: ChildProfile): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_PROFILES, "readwrite");
  const req = tx.objectStore(STORE_PROFILES).put(profile);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadChildProfile(id: string): Promise<ChildProfile | null> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_PROFILES, "readonly");
  const req = tx.objectStore(STORE_PROFILES).get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as ChildProfile) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function listChildProfiles(parentAccountId: string): Promise<ChildProfile[]> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_PROFILES, "readonly");
  const req = tx.objectStore(STORE_PROFILES).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const all = req.result as ChildProfile[];
      resolve(all.filter(p => p.parentAccountId === parentAccountId));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteChildProfile(id: string): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_PROFILES, "readwrite");
  const req = tx.objectStore(STORE_PROFILES).delete(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

/* ─── Progress ───────────────────────────────────────────────────────────────── */

export async function saveChildProgress(progress: ChildProgress): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_PROGRESS, "readwrite");
  const req = tx.objectStore(STORE_PROGRESS).put(progress);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadChildProgress(childProfileId: string): Promise<ChildProgress | null> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_PROGRESS, "readonly");
  const req = tx.objectStore(STORE_PROGRESS).get(childProfileId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as ChildProgress) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/* ─── Reward state ───────────────────────────────────────────────────────────── */

export async function saveRewardState(state: ChildRewardState): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_REWARDS, "readwrite");
  const req = tx.objectStore(STORE_REWARDS).put(state);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadRewardState(childProfileId: string): Promise<ChildRewardState | null> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_REWARDS, "readonly");
  const req = tx.objectStore(STORE_REWARDS).get(childProfileId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as ChildRewardState) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/* ─── Vocabulary ─────────────────────────────────────────────────────────────── */

export async function saveVocabWord(word: VocabWord): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_VOCAB, "readwrite");
  const req = tx.objectStore(STORE_VOCAB).put(word);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadVocabWords(childProfileId: string): Promise<VocabWord[]> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_VOCAB, "readonly");
  const idx = tx.objectStore(STORE_VOCAB).index("byChild");
  const req = idx.getAll(childProfileId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as VocabWord[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteVocabWord(id: string): Promise<void> {
  const db  = await openDb();
  const tx  = db.transaction(STORE_VOCAB, "readwrite");
  const req = tx.objectStore(STORE_VOCAB).delete(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  });
}

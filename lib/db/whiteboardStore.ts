// lib/db/whiteboardStore.ts
// IDB store for whiteboard audio blobs.
//
// Whiteboard caches store narration audio alongside step data. Audio as a
// base64 data URL in localStorage can be several MB per entry — the primary
// driver of quota exhaustion. This module stores the Blob in IndexedDB
// instead; localStorage entries keep only the small metadata (steps,
// narrationScript, diagramPlan, savedAt) without the audio payload.

const DB_NAME    = 'avrrio-whiteboard-v1';
const DB_VERSION = 1;
const STORE      = 'audio_blobs';

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'cacheKey' });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`Failed to open whiteboard DB: ${req.error?.message}`));
  });
}

export async function saveWhiteboardAudio(cacheKey: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ cacheKey, blob, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`saveWhiteboardAudio failed: ${tx.error?.message}`));
  });
}

export async function loadWhiteboardAudio(cacheKey: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(cacheKey);
    req.onsuccess = () => {
      const record = req.result as { cacheKey: string; blob: Blob; savedAt: number } | undefined;
      resolve(record?.blob ?? null);
    };
    req.onerror = () => reject(new Error(`loadWhiteboardAudio failed: ${req.error?.message}`));
  });
}

export async function deleteWhiteboardAudio(cacheKey: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(cacheKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`deleteWhiteboardAudio failed: ${tx.error?.message}`));
  });
}

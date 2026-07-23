// lib/db/examStore.ts
// Transient IndexedDB store for exam sessions in flight (generator → proctor handoff).
// A record is written before navigation and deleted on submit — its lifetime is one exam sitting.

import type { GeneratedExam } from '@/lib/apex/examGenerator';

const DB_NAME    = 'avrrio-apex-sessions';
const DB_VERSION = 1;
const STORE      = 'pending_exams';

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'examId' });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`Failed to open exam session DB: ${req.error?.message}`));
  });
}

export async function savePendingExam(examId: string, exam: GeneratedExam): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ examId, exam });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`savePendingExam failed: ${tx.error?.message}`));
  });
}

export async function loadPendingExam(examId: string): Promise<GeneratedExam | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(examId);
    req.onsuccess = () => {
      const record = req.result as { examId: string; exam: GeneratedExam } | undefined;
      resolve(record?.exam ?? null);
    };
    req.onerror = () => reject(new Error(`loadPendingExam failed: ${req.error?.message}`));
  });
}

export async function deletePendingExam(examId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(examId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`deletePendingExam failed: ${tx.error?.message}`));
  });
}

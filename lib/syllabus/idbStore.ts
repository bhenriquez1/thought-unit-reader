// lib/syllabus/idbStore.ts
// IndexedDB persistence for UniversalSyllabus records.
// One record per documentId, keyed to match BookIntelligence.documentId.
// Separate database per the avrrio-* per-feature IDB convention.

import type { UniversalSyllabus } from "./types";
import { SYLLABUS_VERSION } from "./types";

const DB_NAME    = "avrrio-syllabus";
const DB_VERSION = 1;
const STORE_NAME = "syllabi";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "documentId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveSyllabus(syllabus: UniversalSyllabus): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(syllabus);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

export async function loadSyllabus(documentId: string): Promise<UniversalSyllabus | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(documentId);
    req.onsuccess = () => {
      db.close();
      const rec = req.result as UniversalSyllabus | undefined;
      if (!rec || rec.version !== SYLLABUS_VERSION) { resolve(null); return; }
      resolve(rec);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteSyllabus(documentId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(documentId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

export async function listSyllabusDocumentIds(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => { db.close(); resolve(req.result as string[]); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

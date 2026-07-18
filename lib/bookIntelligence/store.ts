// lib/bookIntelligence/store.ts
// IDB persistence for BookIntelligence records.
//
// One record per documentId. Written once after classification; re-written
// if the document changes significantly or BOOK_INTELLIGENCE_VERSION bumps.
// All downstream panels read from this store — never re-classify independently.

import type { BookIntelligence } from "./types";
import { BOOK_INTELLIGENCE_VERSION } from "./types";

const DB_NAME = "avrrio-book-intelligence";
const STORE_NAME = "intelligence";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "documentId" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist a BookIntelligence record. Overwrites any existing record for the same documentId. */
export async function saveBookIntelligence(record: BookIntelligence): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the BookIntelligence record for a document.
 * Returns null if not yet classified or if the stored version is stale
 * (BOOK_INTELLIGENCE_VERSION bump triggers re-classification).
 */
export async function loadBookIntelligence(documentId: string): Promise<BookIntelligence | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(documentId);
    req.onsuccess = () => {
      const record = req.result as BookIntelligence | undefined;
      if (!record) { resolve(null); return; }
      if (record.version !== BOOK_INTELLIGENCE_VERSION) { resolve(null); return; }
      resolve(record);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete the record for a document (e.g., when the document is removed from the library). */
export async function deleteBookIntelligence(documentId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(documentId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** List all stored documentIds that have a BookIntelligence record. */
export async function listClassifiedDocuments(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

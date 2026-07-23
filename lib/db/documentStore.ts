// lib/db/documentStore.ts
// Durable IndexedDB storage for locally-uploaded PDF documents.
// Stores metadata and binary separately so metadata lookups are fast.
// Used only for local/guest uploads; Firebase users have durable download URLs.

const DB_NAME = 'avrrio-documents';
const DB_VERSION = 1;
const STORE_META = 'documents';
const STORE_FILES = 'files';

export interface DocumentMeta {
  documentId: string;
  title: string;
  mimeType: string;
  byteLength: number;
  createdAt: string;
  updatedAt: string;
  processingStatus: 'pending' | 'complete' | 'failed';
  schemaVersion: number;
}

// Cached connection — only one DB open per tab.
let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'documentId' });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'documentId' });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`Failed to open document DB: ${req.error?.message}`));
    req.onblocked = () => console.warn('documentStore: DB upgrade blocked — close other tabs');
  });
}

export async function saveDocumentMeta(meta: DocumentMeta): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`saveDocumentMeta failed: ${tx.error?.message}`));
  });
}

export async function getDocumentMeta(documentId: string): Promise<DocumentMeta | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(documentId);
    req.onsuccess = () => resolve((req.result as DocumentMeta) ?? null);
    req.onerror = () => reject(new Error(`getDocumentMeta failed: ${req.error?.message}`));
  });
}

export async function getAllDocumentMetas(): Promise<DocumentMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).getAll();
    req.onsuccess = () => resolve((req.result as DocumentMeta[]) ?? []);
    req.onerror = () => reject(new Error(`getAllDocumentMetas failed: ${req.error?.message}`));
  });
}

export async function saveDocumentFile(documentId: string, data: Uint8Array): Promise<void> {
  if (!data || data.byteLength === 0) {
    throw new Error('Cannot save empty PDF binary — file may be corrupted');
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).put({ documentId, data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`saveDocumentFile failed: ${tx.error?.message}`));
  });
}

export async function getDocumentFile(documentId: string): Promise<Uint8Array | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get(documentId);
    req.onsuccess = () => {
      const record = req.result as { documentId: string; data: Uint8Array } | undefined;
      if (!record || !record.data || record.data.byteLength === 0) {
        resolve(null);
      } else {
        resolve(record.data);
      }
    };
    req.onerror = () => reject(new Error(`getDocumentFile failed: ${req.error?.message}`));
  });
}

export async function deleteDocument(documentId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_FILES], 'readwrite');
    tx.objectStore(STORE_META).delete(documentId);
    tx.objectStore(STORE_FILES).delete(documentId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`deleteDocument failed: ${tx.error?.message}`));
  });
}

export async function hasDocumentFile(documentId: string): Promise<boolean> {
  const data = await getDocumentFile(documentId);
  return data !== null;
}

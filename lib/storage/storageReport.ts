// lib/storage/storageReport.ts
// Storage diagnostics — collects a snapshot of localStorage + IndexedDB health.
// Intended for dev use only (accessible via /dev/storage).

export interface LocalStorageKeyEntry {
  key: string;
  bytes: number;
  isBlobUrl: boolean;
  looksLikeExpiredBlob: boolean;
}

export interface IdbDatabaseEntry {
  name: string;
  bytes: number | null; // null when estimation not available
  objectStoreCount: number | null;
}

export interface StorageReport {
  generatedAt: string;
  localStorage: {
    totalBytes: number;
    keyCount: number;
    topKeys: LocalStorageKeyEntry[];
    blobUrlCount: number;
    expiredBlobCount: number;
  };
  indexedDB: {
    databases: IdbDatabaseEntry[];
    totalEstimatedBytes: number | null;
    pdfCount: number;
    avgPdfBytes: number | null;
  };
  health: {
    overQuotaRisk: boolean;     // localStorage > 3 MB
    expiredBlobRefs: string[];  // localStorage keys that store dead blob: URLs
    warnings: string[];
  };
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function lsKeyBytes(key: string): number {
  try {
    return (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
  } catch {
    return 0;
  }
}

function lsKeyValue(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function isBlobUrl(value: string): boolean {
  return value.startsWith('blob:');
}

function looksExpired(key: string, value: string): boolean {
  // A blob: URL stored in localStorage is always invalid after a page reload.
  if (value.startsWith('blob:')) return true;
  // JSON that contains a top-level "blobUrl" or "audioDataUrl" field referencing blob:
  if ((value.includes('"blobUrl":"blob:') || value.includes('"audioDataUrl":"blob:'))) return true;
  return false;
}

function collectLocalStorage(): StorageReport['localStorage'] & { expiredBlobKeys: string[] } {
  const entries: LocalStorageKeyEntry[] = [];
  const expiredBlobKeys: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = lsKeyValue(key);
      const bytes = (key.length + value.length) * 2;
      const isBlob = isBlobUrl(value);
      const expired = looksExpired(key, value);
      if (expired) expiredBlobKeys.push(key);
      entries.push({ key, bytes, isBlobUrl: isBlob, looksLikeExpiredBlob: expired });
    }
  } catch {
    // localStorage blocked (e.g. Firefox private mode)
  }

  const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);
  const topKeys = [...entries].sort((a, b) => b.bytes - a.bytes).slice(0, 15);

  return {
    totalBytes,
    keyCount: entries.length,
    topKeys,
    blobUrlCount: entries.filter(e => e.isBlobUrl).length,
    expiredBlobCount: expiredBlobKeys.length,
    expiredBlobKeys,
  };
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

async function openDbReadonly(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function estimateIdbBytes(db: IDBDatabase): Promise<number | null> {
  // Storage Estimate API gives a total; per-DB estimation not possible without
  // iterating all records. Return null — we'll use the browser Storage API total instead.
  return null;
}

async function countPdfRecords(db: IDBDatabase): Promise<number> {
  // avrrio-documents (from lib/db/documentStore.ts) uses stores "documents" and "files".
  // Legacy store names (pdf_data, books) are checked as fallback for older schemas.
  const stores = Array.from(db.objectStoreNames);
  const storeName =
    stores.includes('documents') ? 'documents' :
    stores.includes('pdf_data')  ? 'pdf_data'  :
    stores.includes('books')     ? 'books'      :
    null;
  if (!storeName) return 0;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

async function collectIndexedDB(): Promise<StorageReport['indexedDB']> {
  let databases: IdbDatabaseEntry[] = [];
  let pdfCount = 0;

  try {
    const dbList = await indexedDB.databases();
    for (const { name } of dbList) {
      if (!name) continue;
      const db = await openDbReadonly(name);
      if (!db) {
        databases.push({ name, bytes: null, objectStoreCount: null });
        continue;
      }
      const storeCount = db.objectStoreNames.length;
      const bytes = await estimateIdbBytes(db);
      databases.push({ name, bytes, objectStoreCount: storeCount });
      // Count PDFs in any known PDF store
      if (name.includes('book') || name.includes('pdf') || name.includes('avrrio')) {
        pdfCount += await countPdfRecords(db);
      }
      db.close();
    }
  } catch {
    // indexedDB.databases() not supported in all browsers
  }

  // Total byte estimate from StorageManager
  let totalEstimatedBytes: number | null = null;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      totalEstimatedBytes = est.usage ?? null;
    }
  } catch {}

  return {
    databases,
    totalEstimatedBytes,
    pdfCount,
    avgPdfBytes: null, // would require reading each record — too slow for a quick report
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateStorageReport(): Promise<StorageReport> {
  const ls = collectLocalStorage();
  const idb = await collectIndexedDB();

  const warnings: string[] = [];
  if (ls.totalBytes > 3 * 1024 * 1024) {
    warnings.push(`localStorage is ${(ls.totalBytes / 1024 / 1024).toFixed(1)} MB — approaching quota (5 MB limit in most browsers).`);
  }
  if (ls.expiredBlobCount > 0) {
    warnings.push(`${ls.expiredBlobCount} localStorage key(s) contain stale blob: URLs that are invalid after a page reload.`);
  }
  if (idb.pdfCount === 0) {
    warnings.push('No PDF records found in IndexedDB — PDFs may be stored as blob: URLs only and will not survive refresh.');
  }

  return {
    generatedAt: new Date().toISOString(),
    localStorage: {
      totalBytes: ls.totalBytes,
      keyCount: ls.keyCount,
      topKeys: ls.topKeys,
      blobUrlCount: ls.blobUrlCount,
      expiredBlobCount: ls.expiredBlobCount,
    },
    indexedDB: idb,
    health: {
      overQuotaRisk: ls.totalBytes > 3 * 1024 * 1024,
      expiredBlobRefs: ls.expiredBlobKeys,
      warnings,
    },
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

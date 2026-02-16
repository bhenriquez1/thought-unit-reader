// lib/storage/indexedDB.ts
// Shared IndexedDB wrapper for storing large data that doesn't fit in localStorage
// Used by cognitive engines, expert view, and other stores

const DB_NAME = 'ThoughtUnitReaderDB';
const DB_VERSION = 2;

// Store names for different types of data
export const STORE_NAMES = {
  // Document-level caches
  docCache: 'docCache',
  pageCache: 'pageCache',
  // Cognitive engine data
  insights: 'insights',
  decisionRules: 'decisionRules',
  reasoningLoops: 'reasoningLoops',
  // Expert view data
  knowledgeCards: 'knowledgeCards',
  syllabusMatches: 'syllabusMatches',
  // Study data
  studyCards: 'studyCards',
  studyProgress: 'studyProgress',
} as const;

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

// ============================================================================
// Database Initialization
// ============================================================================

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] Failed to open database:', request.error);
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle database closing
      dbInstance.onclose = () => {
        dbInstance = null;
        dbPromise = null;
      };

      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('[IndexedDB] Upgrading database schema to version', DB_VERSION);

      // Create object stores
      Object.values(STORE_NAMES).forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          // Use composite key for most stores: docId + optional secondary key
          const store = db.createObjectStore(storeName, { keyPath: 'key' });
          store.createIndex('docId', 'docId', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          console.log(`[IndexedDB] Created store "${storeName}"`);
        }
      });
    };
  });

  return dbPromise;
}

// ============================================================================
// Generic CRUD Operations
// ============================================================================

export interface StoredRecord<T> {
  key: string;
  docId: string;
  data: T;
  updatedAt: number;
}

async function put<T>(
  storeName: StoreName,
  key: string,
  docId: string,
  data: T
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const record: StoredRecord<T> = {
        key,
        docId,
        data,
        updatedAt: Date.now(),
      };
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(`[IndexedDB] Failed to save to ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn(`[IndexedDB] put failed for ${storeName}:`, error);
    // Graceful degradation - don't throw
  }
}

async function get<T>(
  storeName: StoreName,
  key: string
): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as StoredRecord<T> | undefined;
        resolve(result?.data ?? null);
      };
      request.onerror = () => {
        console.error(`[IndexedDB] Failed to load from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn(`[IndexedDB] get failed for ${storeName}:`, error);
    return null;
  }
}

async function getByDocId<T>(
  storeName: StoreName,
  docId: string
): Promise<T[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index('docId');
      const request = index.getAll(docId);

      request.onsuccess = () => {
        const results = request.result as StoredRecord<T>[];
        resolve(results.map(r => r.data));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn(`[IndexedDB] getByDocId failed for ${storeName}:`, error);
    return [];
  }
}

async function remove(
  storeName: StoreName,
  key: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn(`[IndexedDB] remove failed for ${storeName}:`, error);
  }
}

async function removeByDocId(
  storeName: StoreName,
  docId: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const index = store.index('docId');
      const request = index.openCursor(docId);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn(`[IndexedDB] removeByDocId failed for ${storeName}:`, error);
  }
}

// ============================================================================
// High-Level API for Document/Page Caching
// ============================================================================

export async function putDocCache<T>(
  docId: string,
  payload: T
): Promise<void> {
  await put(STORE_NAMES.docCache, docId, docId, payload);
}

export async function getDocCache<T>(docId: string): Promise<T | null> {
  return get<T>(STORE_NAMES.docCache, docId);
}

export async function putPageCache<T>(
  docId: string,
  pageIndex: number,
  payload: T
): Promise<void> {
  const key = `${docId}:page:${pageIndex}`;
  await put(STORE_NAMES.pageCache, key, docId, payload);
}

export async function getPageCache<T>(
  docId: string,
  pageIndex: number
): Promise<T | null> {
  const key = `${docId}:page:${pageIndex}`;
  return get<T>(STORE_NAMES.pageCache, key);
}

// ============================================================================
// High-Level API for Cognitive Engine Data
// ============================================================================

export async function putInsights<T>(
  docId: string,
  insights: Record<string, T>
): Promise<void> {
  const key = `${docId}:insights`;
  await put(STORE_NAMES.insights, key, docId, insights);
}

export async function getInsights<T>(
  docId: string
): Promise<Record<string, T> | null> {
  const key = `${docId}:insights`;
  return get<Record<string, T>>(STORE_NAMES.insights, key);
}

export async function putDecisionRules<T>(
  docId: string,
  rules: Record<string, T>
): Promise<void> {
  const key = `${docId}:rules`;
  await put(STORE_NAMES.decisionRules, key, docId, rules);
}

export async function getDecisionRules<T>(
  docId: string
): Promise<Record<string, T> | null> {
  const key = `${docId}:rules`;
  return get<Record<string, T>>(STORE_NAMES.decisionRules, key);
}

export async function putKnowledgeCards<T>(
  docId: string,
  cards: Record<string, T>
): Promise<void> {
  const key = `${docId}:cards`;
  await put(STORE_NAMES.knowledgeCards, key, docId, cards);
}

export async function getKnowledgeCards<T>(
  docId: string
): Promise<Record<string, T> | null> {
  const key = `${docId}:cards`;
  return get<Record<string, T>>(STORE_NAMES.knowledgeCards, key);
}

// ============================================================================
// Cleanup and Maintenance
// ============================================================================

export async function clearDocData(docId: string): Promise<void> {
  const stores = Object.values(STORE_NAMES);
  await Promise.all(stores.map(store => removeByDocId(store, docId)));
  console.log(`[IndexedDB] Cleared all data for document: ${docId}`);
}

export async function pruneOldCaches(maxAgeDays: number = 30): Promise<number> {
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  try {
    const db = await openDB();
    const stores = Object.values(STORE_NAMES);

    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('updatedAt');
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request = index.openCursor(range);

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    }
  } catch (error) {
    console.warn('[IndexedDB] pruneOldCaches failed:', error);
  }

  console.log(`[IndexedDB] Pruned ${deletedCount} old cache entries`);
  return deletedCount;
}

// ============================================================================
// Storage Usage Estimation
// ============================================================================

export async function estimateStorageUsage(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      percentUsed: estimate.quota
        ? Math.round(((estimate.usage || 0) / estimate.quota) * 100)
        : 0,
    };
  } catch {
    return null;
  }
}

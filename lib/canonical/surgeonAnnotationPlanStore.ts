// lib/canonical/surgeonAnnotationPlanStore.ts
// IDB persistence for SurgeonAnnotationPlan, keyed by the versioned cache key from
// lib/insights/annotationPlanCache.ts's buildAnnotationCacheKey(). A version bump
// (structure/paragraph-algorithm/semantic-pack/model) produces a different key, so
// stale-version entries just miss cleanly on lookup — no migration step needed.
//
// Modeled directly on lib/canonical/store.ts's pattern: promise-wrapped openDB(),
// single object store, keyPath, secondary index for page-scoped pruning.
//
// pageNumber below is 1-based, matching pageTruthKey's own convention and
// buildAnnotationCacheKey's own pageNumber param — previously named
// pageIndex and fed a 0-based value, the one 0-based page identity in an
// app where everything else is 1-based (Thought Unit Engine identity
// audit's RC7 finding). The byDocumentPage secondary index this field feeds has
// no live caller today (getSurgeonAnnotationPlansByPage/
// deleteSurgeonAnnotationPlansByDocument are exported but unused), so this
// rename carries no migration risk — nothing queries by the old
// pageIndex-keyed shape.

import type { SurgeonAnnotationPlan } from '../insights/pageAnnotationPlan';

const DB_NAME    = 'avrrio_surgeon_plans_v1';
const STORE_NAME = 'surgeon_plans_v1';

export interface StoredSurgeonAnnotationPlan {
  /** Primary key — the versioned cache key from buildAnnotationCacheKey(). */
  cacheKey: string;
  documentId: string;
  pageNumber: number;
  plan: SurgeonAnnotationPlan;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? req.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      if (!store.indexNames.contains('byDocumentPage')) {
        store.createIndex('byDocumentPage', ['documentId', 'pageNumber']);
      }
    };
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
    req.onblocked  = () => reject(new Error('IDB blocked'));
  });
}

/** Upsert a single plan under its versioned cache key. */
export async function saveSurgeonAnnotationPlan(
  documentId: string,
  pageNumber: number,
  cacheKey: string,
  plan: SurgeonAnnotationPlan,
): Promise<void> {
  const db = await openDB();
  const record: StoredSurgeonAnnotationPlan = { cacheKey, documentId, pageNumber, plan, createdAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** Get a plan by its exact versioned cache key — a miss means either no plan was
 *  ever generated for this page, or the cached one is under a stale version. */
export async function getSurgeonAnnotationPlan(cacheKey: string): Promise<StoredSurgeonAnnotationPlan | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(cacheKey);
    req.onsuccess = () => resolve((req.result as StoredSurgeonAnnotationPlan) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/** Get all stored plans (any version) for a page — used to prune stale-version
 *  entries once a fresh plan under the current version has been saved. */
export async function getSurgeonAnnotationPlansByPage(
  documentId: string,
  pageNumber: number,
): Promise<StoredSurgeonAnnotationPlan[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const idx = tx.objectStore(STORE_NAME).index('byDocumentPage');
    const req = idx.getAll(IDBKeyRange.only([documentId, pageNumber]));
    req.onsuccess = () => resolve((req.result as StoredSurgeonAnnotationPlan[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

/** Delete every stored plan for a document (used on document deletion). */
export async function deleteSurgeonAnnotationPlansByDocument(documentId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const idx   = store.index('byDocumentPage');
    const range = IDBKeyRange.bound([documentId, -Infinity], [documentId, Infinity]);
    const req   = idx.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

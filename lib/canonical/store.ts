// lib/canonical/store.ts
// IDB persistence for CanonicalThoughtUnit.
// Store: "canonical_units_v1" in DB "avrrio_canonical_v1".
// Key path: "id" (the `${documentId}:${pageIndex}:${unitIndex}` stable key).

import type { CanonicalThoughtUnit } from './types';
import { saveCanonicalUnitsPage, loadCanonicalUnitsPage } from '@/lib/firebase/durableState';

const DB_NAME    = 'avrrio_canonical_v1';
const STORE_NAME = 'canonical_units_v1';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byDocument', 'documentId');
        store.createIndex('byDocumentPage', ['documentId', 'pageIndex']);
      }
    };
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
    req.onblocked  = () => reject(new Error('IDB blocked'));
  });
}

/** Upsert many units into IDB only — no cloud sync. Shared by the public
 *  save path below and by the cloud-fallback backfill in
 *  getCanonicalUnitsByPage, which must never re-upload what it just
 *  downloaded. */
async function putUnitsLocal(units: CanonicalThoughtUnit[]): Promise<void> {
  if (!units.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const u of units) store.put(u);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** L14 — best-effort Firestore mirror, grouped per (documentId, pageIndex)
 *  since a single save can span multiple pages (pages/index.tsx's
 *  startBookProcessing batches a whole extraction pass into one
 *  saveCanonicalUnits call). Fire-and-forget from its own caller below:
 *  a signed-out user, an offline browser, or a genuine Firestore error must
 *  never break local extraction/reads, which IndexedDB already serves
 *  reliably on its own.
 *
 *  Each page group is READ-merge-written, not blindly overwritten:
 *  saveCanonicalUnitsPage's setDoc replaces the ENTIRE units array for that
 *  page, so a naive overwrite from linkQuestionToUnit's single-unit
 *  saveCanonicalUnit call would silently wipe every sibling unit already
 *  mirrored for that page. Merging by id keeps both the multi-unit batch
 *  save (first extraction) and a later single-unit update (question
 *  linking) correct without either one needing to know which case it is. */
async function syncCanonicalUnitsToCloud(units: CanonicalThoughtUnit[]): Promise<void> {
  const groups = new Map<string, { documentId: string; pageIndex: number; units: CanonicalThoughtUnit[] }>();
  for (const u of units) {
    const key = `${u.documentId}::${u.pageIndex}`;
    const group = groups.get(key);
    if (group) group.units.push(u);
    else groups.set(key, { documentId: u.documentId, pageIndex: u.pageIndex, units: [u] });
  }
  await Promise.all(Array.from(groups.values()).map(async (group) => {
    try {
      const existing = await loadCanonicalUnitsPage(group.documentId, group.pageIndex);
      const byId = new Map<string, CanonicalThoughtUnit>(
        Array.isArray(existing) ? (existing as CanonicalThoughtUnit[]).map((u) => [u.id, u]) : [],
      );
      for (const u of group.units) byId.set(u.id, u);
      await saveCanonicalUnitsPage(group.documentId, group.pageIndex, Array.from(byId.values()));
    } catch (err) {
      console.error('[CANONICAL_UNITS_CLOUD_SYNC_ERROR]', {
        documentId: group.documentId, pageIndex: group.pageIndex,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }));
}

/** Upsert a single unit. */
export async function saveCanonicalUnit(unit: CanonicalThoughtUnit): Promise<void> {
  await putUnitsLocal([unit]);
  void syncCanonicalUnitsToCloud([unit]);
}

/** Upsert many units in a single IDB transaction, then mirror to Firestore
 *  (per page, best-effort, not awaited — see syncCanonicalUnitsToCloud) so a
 *  different device/session can still ground NoteLab's AI notebook
 *  synthesis without ever having locally processed this page itself. */
export async function saveCanonicalUnits(units: CanonicalThoughtUnit[]): Promise<void> {
  if (!units.length) return;
  await putUnitsLocal(units);
  void syncCanonicalUnitsToCloud(units);
}

/** Get all units for a document, sorted by pageIndex then unitIndex. */
export async function getCanonicalUnitsByDocument(
  documentId: string,
): Promise<CanonicalThoughtUnit[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const idx   = tx.objectStore(STORE_NAME).index('byDocument');
    const req   = idx.getAll(IDBKeyRange.only(documentId));
    req.onsuccess = () => {
      const all = (req.result as CanonicalThoughtUnit[]) ?? [];
      all.sort((a, b) =>
        a.pageIndex !== b.pageIndex
          ? a.pageIndex - b.pageIndex
          : a.unitIndex - b.unitIndex,
      );
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Get units for a single page, IDB only — no cloud fallback. */
async function getCanonicalUnitsByPageLocal(
  documentId: string,
  pageIndex: number,
): Promise<CanonicalThoughtUnit[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const idx = tx.objectStore(STORE_NAME).index('byDocumentPage');
    const req = idx.getAll(IDBKeyRange.only([documentId, pageIndex]));
    req.onsuccess = () => {
      const all = (req.result as CanonicalThoughtUnit[]) ?? [];
      all.sort((a, b) => a.unitIndex - b.unitIndex);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Get units for a single page. Falls back to the Firestore mirror (L14)
 *  when the local IDB cache has nothing for this page yet — the case for
 *  any device/session other than the one that originally processed this
 *  book — and backfills IDB with what it finds so subsequent reads on this
 *  device are local and fast. Never throws on a cloud failure: an empty
 *  local result is returned as before, same as prior behavior when there
 *  genuinely are no units for this page. */
export async function getCanonicalUnitsByPage(
  documentId: string,
  pageIndex: number,
): Promise<CanonicalThoughtUnit[]> {
  const local = await getCanonicalUnitsByPageLocal(documentId, pageIndex);
  if (local.length > 0) return local;
  try {
    const cloudUnits = await loadCanonicalUnitsPage(documentId, pageIndex);
    if (cloudUnits && cloudUnits.length > 0) {
      const units = cloudUnits as CanonicalThoughtUnit[];
      await putUnitsLocal(units);
      return units.slice().sort((a, b) => a.unitIndex - b.unitIndex);
    }
  } catch (err) {
    console.error('[CANONICAL_UNITS_CLOUD_FALLBACK_ERROR]', {
      documentId, pageIndex, err: err instanceof Error ? err.message : String(err),
    });
  }
  return local;
}

/** Get a single unit by its stable ID. */
export async function getCanonicalUnit(id: string): Promise<CanonicalThoughtUnit | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as CanonicalThoughtUnit) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/** Append a questionId to a unit's questionIds array. Idempotent. */
export async function linkQuestionToUnit(unitId: string, questionId: string): Promise<void> {
  const unit = await getCanonicalUnit(unitId);
  if (!unit) return;
  const ids = new Set(unit.questionIds ?? []);
  if (ids.has(questionId)) return;
  ids.add(questionId);
  await saveCanonicalUnit({ ...unit, questionIds: [...ids], updatedAt: Date.now() });
}

/** Delete all units for a document (used on document deletion). */
export async function deleteCanonicalUnitsByDocument(documentId: string): Promise<void> {
  const units = await getCanonicalUnitsByDocument(documentId);
  if (!units.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const u of units) store.delete(u.id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

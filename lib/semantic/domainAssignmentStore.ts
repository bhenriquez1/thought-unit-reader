// lib/semantic/domainAssignmentStore.ts
// IndexedDB persistence for SemanticDomainAssignment records.
//
// DB:    "avrrio_semantic_v1"
// Store: "domain_assignments"  keyPath: ["documentId", "chapterId"]
//
// chapterId is always stored as a string — callers that omit it pass "".
// This matches the lookup convention so compound-key lookups stay consistent.

import type { SemanticDomainAssignment } from "./types";

const DB_NAME    = "avrrio_semantic_v1";
const STORE_NAME = "domain_assignments";
const DB_VERSION = 1;

// ── IDB helpers ──────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ["documentId", "chapterId"] });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

// ── Normalisation ────────────────────────────────────────────────────────────

/** Ensure chapterId is never undefined in stored records. */
function normalize(a: SemanticDomainAssignment): SemanticDomainAssignment {
  return { ...a, chapterId: a.chapterId ?? "" };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Persist an assignment, overwriting any existing record for the same
 * (documentId, chapterId) pair.
 */
export async function saveAssignment(
  assignment: SemanticDomainAssignment,
): Promise<void> {
  const db = await openDB();
  const store = tx(db, "readwrite");
  await promisify(store.put(normalize(assignment)));
}

/**
 * Retrieve the assignment for a (documentId, chapterId) pair.
 * Returns undefined if no record exists.
 * Pass chapterId = "" to look up a document-level assignment.
 */
export async function getAssignment(
  documentId: string,
  chapterId = "",
): Promise<SemanticDomainAssignment | undefined> {
  const db = await openDB();
  const store = tx(db, "readonly");
  return promisify<SemanticDomainAssignment | undefined>(
    store.get([documentId, chapterId]),
  );
}

/**
 * Return all assignments for a given documentId (document-level + all chapters).
 * Results are unsorted — callers sort as needed.
 */
export async function getAllAssignments(
  documentId: string,
): Promise<SemanticDomainAssignment[]> {
  const db  = await openDB();
  const store = tx(db, "readonly");
  const all   = await promisify<SemanticDomainAssignment[]>(store.getAll());
  return all.filter(a => a.documentId === documentId);
}

/**
 * Delete the assignment for a specific (documentId, chapterId) pair.
 * Pass chapterId = "" to delete the document-level assignment.
 */
export async function deleteAssignment(
  documentId: string,
  chapterId = "",
): Promise<void> {
  const db = await openDB();
  const store = tx(db, "readwrite");
  await promisify(store.delete([documentId, chapterId]));
}

/**
 * Write a user override, stamping source = "user" and updatedAt = now.
 * Merges with any existing classifier-detected fields that should be preserved.
 */
export async function upsertUserOverride(
  documentId: string,
  chapterId: string | undefined,
  domain: SemanticDomainAssignment["domain"],
): Promise<SemanticDomainAssignment> {
  const chapId = chapterId ?? "";
  const existing = await getAssignment(documentId, chapId);
  const updated: SemanticDomainAssignment = {
    ...(existing ?? {}),
    documentId,
    chapterId:         chapId,
    domain,
    confidence:        1,
    source:            "user",
    classifierVersion: existing?.classifierVersion ?? 0,
    updatedAt:         Date.now(),
  };
  await saveAssignment(updated);
  return updated;
}

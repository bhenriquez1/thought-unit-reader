// lib/stickyNotes/stickyNoteStore.ts
// C1 — Reader Sticky Notes: quick, page-linked annotations distinct from
// NoteLab's permanent notebook (lib/notelab/ultraNoteStore.ts). IDB-first
// storage, mirroring lib/highlights/savedHighlightsStore.ts's persistence
// pattern (IDB primary, localStorage mirror/fallback).
//
// Keyed by the RESOLVED documentId (lib/insights/resolveDocumentIdentity.ts),
// not bookId. A sticky note can reference specific evidence/concepts that
// are themselves documentId-scoped (CanonicalThoughtUnit, KnowledgeNode) —
// using the collision-resistant identity here, not the filename-derived
// grouping key, is what keeps a note's provenance links valid even when a
// book re-upload resolves to a different document sharing the same bookId.

const DB_NAME = "avrrio_sticky_notes_v1";
const STORE = "stickyNotes";
const LS_KEY = "stickyNotes_v1";

/** The exact source span a note is anchored to, when it was taken from a
 *  specific highlighted unit rather than the page in general. */
export interface StickyNoteEvidenceAnchor {
  text: string;
  anchorType?: string;
}

export interface StickyNote {
  id: string;
  /** Resolved, collision-resistant document identity — see module comment. */
  documentId: string;
  /** `${documentId}::${pageNumber}::${textReady}` — lib/useActivePageIntelligence.ts's buildPageTruthKey convention. */
  pageTruthKey: string;
  /** 1-based. */
  pageNumber: number;
  text: string;
  /** Optional link to the CanonicalThoughtUnit this note was taken about. */
  canonicalUnitId?: string;
  /** Optional link to a Knowledge Graph concept/node. */
  knowledgeNodeId?: string;
  /** Optional source-evidence anchor — present when the note was taken
   *  against a specific highlighted span, not just "this page." */
  evidence?: StickyNoteEvidenceAnchor;
  createdAt: number;
  updatedAt: number;
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openStickyNotesIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPutAll(records: StickyNote[]): Promise<void> {
  const db = await openStickyNotesIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    os.clear();
    for (const r of records) os.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGetAll(): Promise<StickyNote[]> {
  const db = await openStickyNotesIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as StickyNote[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── Generic load/save ───────────────────────────────────────────────────────

async function loadAll(): Promise<StickyNote[]> {
  // No separate `typeof window === "undefined"` early return — the try/catch
  // below already handles an environment with neither IndexedDB nor
  // localStorage (e.g. SSR, or a Node test runner) by falling through to an
  // empty result, without needing `window` itself to exist first.
  try {
    const idbRecords = await idbGetAll();
    if (idbRecords.length > 0) {
      return idbRecords.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  } catch (e) { console.warn("[STICKY_NOTES_IDB_LOAD_FAIL]", { error: String(e) }); }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const lsRecords: StickyNote[] = Array.isArray(parsed) ? parsed : [];
    if (lsRecords.length > 0) idbPutAll(lsRecords).catch(() => {});
    return lsRecords.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

async function saveAll(records: StickyNote[]): Promise<void> {
  const capped = records.slice(0, 500);
  try {
    await idbPutAll(capped);
  } catch (idbErr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(capped));
    } catch (lsErr) {
      throw new Error(`Sticky note storage failed — IDB: ${String(idbErr)} / LS: ${String(lsErr)}`);
    }
  }
}

function genId(): string {
  return `sn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface CreateStickyNoteInput {
  documentId: string;
  pageTruthKey: string;
  pageNumber: number;
  text: string;
  canonicalUnitId?: string;
  knowledgeNodeId?: string;
  evidence?: StickyNoteEvidenceAnchor;
}

export async function createStickyNote(input: CreateStickyNoteInput): Promise<StickyNote> {
  const now = Date.now();
  const note: StickyNote = {
    id: genId(),
    documentId: input.documentId,
    pageTruthKey: input.pageTruthKey,
    pageNumber: input.pageNumber,
    text: input.text,
    canonicalUnitId: input.canonicalUnitId,
    knowledgeNodeId: input.knowledgeNodeId,
    evidence: input.evidence,
    createdAt: now,
    updatedAt: now,
  };
  const existing = await loadAll();
  await saveAll([note, ...existing]);
  return note;
}

export async function updateStickyNoteText(id: string, text: string): Promise<void> {
  const existing = await loadAll();
  const next = existing.map((n) => (n.id === id ? { ...n, text, updatedAt: Date.now() } : n));
  await saveAll(next);
}

export async function deleteStickyNote(id: string): Promise<void> {
  const existing = await loadAll();
  await saveAll(existing.filter((n) => n.id !== id));
}

export async function getStickyNotesForDocument(documentId: string): Promise<StickyNote[]> {
  const all = await loadAll();
  return all.filter((n) => n.documentId === documentId);
}

export async function getStickyNotesForPage(documentId: string, pageNumber: number): Promise<StickyNote[]> {
  const all = await loadAll();
  return all.filter((n) => n.documentId === documentId && n.pageNumber === pageNumber);
}

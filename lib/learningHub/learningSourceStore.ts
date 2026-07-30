// lib/learningHub/learningSourceStore.ts
// IDB-first persistence for Learning Sources — supplemental study materials
// (lecture notes, articles, videos, research papers) attached to a book.
//
// Design rule: these records ENRICH the canonical textbook units; they never
// silently replace or overwrite any textbook-grounded SavedHighlight or
// KnowledgeNode. Extracted thought units carry full provenance labels so the
// learner always knows which source a fact came from.

const DB_NAME = "avrrio_sources_v1";
const STORE   = "learningSources";
const LS_KEY  = "learningSources_v1";

// ── Source types + display constants ─────────────────────────────────────────

export type LearningSourceType =
  | "lecture_notes"
  | "article"
  | "video"
  | "audio"
  | "research"
  | "other";

export const PROVENANCE_LABELS: Record<LearningSourceType, string> = {
  lecture_notes: "University Lecture",
  article:       "Article",
  video:         "Educational Video",
  audio:         "Lecture Audio",
  research:      "Peer-reviewed",
  other:         "External Resource",
};

export const PROVENANCE_COLORS: Record<
  LearningSourceType,
  { border: string; bg: string; text: string }
> = {
  lecture_notes: { border: "#60a5fa", bg: "rgba(96,165,250,0.08)",  text: "#93c5fd" },
  article:       { border: "#4ade80", bg: "rgba(74,222,128,0.08)",  text: "#86efac" },
  video:         { border: "#c084fc", bg: "rgba(192,132,252,0.08)", text: "#d8b4fe" },
  audio:         { border: "#fb923c", bg: "rgba(251,146,60,0.08)",  text: "#fdba74" },
  research:      { border: "#f472b6", bg: "rgba(244,114,182,0.08)", text: "#f9a8d4" },
  other:         { border: "#94a3b8", bg: "rgba(148,163,184,0.08)", text: "#cbd5e1" },
};

// ── Schema ────────────────────────────────────────────────────────────────────

export interface ExtractedThoughtUnit {
  id:           string;
  text:         string;    // verbatim passage from the source
  anchorType:   string;    // "coreIdea" | "mechanism" | "trap" | "definition" | etc.
  reason:       string;    // ≤10-word rationale
  conceptTitle: string;    // nearest textbook concept this reinforces
  grounding:    string;    // 1-sentence: how it connects to the textbook concept
}

export interface LearningSource {
  id:           string;    // "ls-{timestamp}-{random5}"
  bookId:       string;
  label:        string;    // user-given display name
  type:         LearningSourceType;
  text:         string;    // pasted/fetched source content
  url?:         string;    // optional origin URL
  thoughtUnits: ExtractedThoughtUnit[];
  createdAt:    number;
}

// ── IDB helpers ───────────────────────────────────────────────────────────────

function openSourcesIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("bookId", "bookId", { unique: false });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(record: LearningSource): Promise<void> {
  const db = await openSourcesIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openSourcesIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGetByBook(bookId: string): Promise<LearningSource[]> {
  const db = await openSourcesIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("bookId").getAll(bookId);
    req.onsuccess = () => resolve((req.result as LearningSource[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetAll(): Promise<LearningSource[]> {
  const db = await openSourcesIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as LearningSource[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── localStorage fallback ─────────────────────────────────────────────────────

function lsGetAll(): LearningSource[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function lsSaveAll(records: LearningSource[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(records)); } catch {}
}

// ── ID generation ─────────────────────────────────────────────────────────────

export function genSourceId(): string {
  return `ls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function genUnitId(): string {
  return `lsu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function saveSource(source: LearningSource): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await idbPut(source);
    // mirror to localStorage for sync-read paths
    const all = lsGetAll().filter(r => r.id !== source.id);
    lsSaveAll([source, ...all]);
  } catch {
    const all = lsGetAll().filter(r => r.id !== source.id);
    lsSaveAll([source, ...all]);
  }
}

export async function loadSourcesForBook(bookId: string): Promise<LearningSource[]> {
  if (typeof window === "undefined") return [];
  try {
    const records = await idbGetByBook(bookId);
    if (records.length > 0) {
      return records.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch {}
  // fallback
  return lsGetAll()
    .filter(r => r.bookId === bookId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSource(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  try { await idbDelete(id); } catch {}
  lsSaveAll(lsGetAll().filter(r => r.id !== id));
}

export async function updateSource(source: LearningSource): Promise<void> {
  return saveSource(source);
}

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

// ── Source authority levels ───────────────────────────────────────────────────
// Priority order: textbook > guideline > professor > blueprint > peer-review
//                 > video > chief-resident-explanation > personal-note
export type SourceAuthority =
  | "primary-textbook"      // 1 — highest: the source textbook itself
  | "professional-guideline"// 2
  | "professor-material"    // 3
  | "exam-blueprint"        // 4
  | "peer-reviewed"         // 5
  | "educational-video"     // 6
  | "ai-explanation"        // 7
  | "personal-note";        // 8 — lowest: student's own writing

export const AUTHORITY_PRIORITY: Record<SourceAuthority, number> = {
  "primary-textbook":       1,
  "professional-guideline": 2,
  "professor-material":     3,
  "exam-blueprint":         4,
  "peer-reviewed":          5,
  "educational-video":      6,
  "ai-explanation":         7,
  "personal-note":          8,
};

export const AUTHORITY_LABELS: Record<SourceAuthority, string> = {
  "primary-textbook":       "Primary Textbook",
  "professional-guideline": "Professional Guideline",
  "professor-material":     "Professor Material",
  "exam-blueprint":         "Exam Blueprint",
  "peer-reviewed":          "Peer-reviewed Article",
  "educational-video":      "Educational Video",
  "ai-explanation":         "AI / Chief Resident",
  "personal-note":          "Personal Note",
};

// ── Source types + display constants ─────────────────────────────────────────

export type LearningSourceType =
  | "textbook"
  | "professor_notes"
  | "exam_blueprint"
  | "video"
  | "article"
  | "personal_note"
  | "chief_resident"
  | "recall_mistake"
  | "whiteboard"
  | "lecture_notes"  // legacy alias for professor_notes
  | "audio"
  | "research"
  | "other";

export const AUTHORITY_FOR_TYPE: Record<LearningSourceType, SourceAuthority> = {
  textbook:        "primary-textbook",
  professor_notes: "professor-material",
  lecture_notes:   "professor-material",
  exam_blueprint:  "exam-blueprint",
  video:           "educational-video",
  article:         "peer-reviewed",
  research:        "peer-reviewed",
  personal_note:   "personal-note",
  chief_resident:  "ai-explanation",
  recall_mistake:  "personal-note",
  whiteboard:      "ai-explanation",
  audio:           "educational-video",
  other:           "personal-note",
};

export const PROVENANCE_LABELS: Record<LearningSourceType, string> = {
  textbook:        "Primary Textbook",
  professor_notes: "Professor Material",
  lecture_notes:   "University Lecture",
  exam_blueprint:  "Exam Blueprint",
  video:           "Educational Video",
  article:         "Article",
  research:        "Peer-reviewed",
  personal_note:   "Personal Note",
  chief_resident:  "Chief Resident",
  recall_mistake:  "Recall Mistake",
  whiteboard:      "Whiteboard Save",
  audio:           "Lecture Audio",
  other:           "External Resource",
};

export const PROVENANCE_COLORS: Record<
  LearningSourceType,
  { border: string; bg: string; text: string }
> = {
  textbook:        { border: "#fde047", bg: "rgba(253,224,71,0.08)",  text: "#fde047" },
  professor_notes: { border: "#60a5fa", bg: "rgba(96,165,250,0.08)",  text: "#93c5fd" },
  lecture_notes:   { border: "#60a5fa", bg: "rgba(96,165,250,0.08)",  text: "#93c5fd" },
  exam_blueprint:  { border: "#fb923c", bg: "rgba(251,146,60,0.08)",  text: "#fdba74" },
  video:           { border: "#c084fc", bg: "rgba(192,132,252,0.08)", text: "#d8b4fe" },
  article:         { border: "#4ade80", bg: "rgba(74,222,128,0.08)",  text: "#86efac" },
  research:        { border: "#f472b6", bg: "rgba(244,114,182,0.08)", text: "#f9a8d4" },
  personal_note:   { border: "#94a3b8", bg: "rgba(148,163,184,0.08)", text: "#cbd5e1" },
  chief_resident:  { border: "#67e8f9", bg: "rgba(103,232,249,0.08)", text: "#67e8f9" },
  recall_mistake:  { border: "#fca5a5", bg: "rgba(252,165,165,0.08)", text: "#fca5a5" },
  whiteboard:      { border: "#86efac", bg: "rgba(134,239,172,0.08)", text: "#86efac" },
  audio:           { border: "#fb923c", bg: "rgba(251,146,60,0.08)",  text: "#fdba74" },
  other:           { border: "#94a3b8", bg: "rgba(148,163,184,0.08)", text: "#cbd5e1" },
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
  id:               string;              // "ls-{timestamp}-{random5}"
  bookId:           string;
  chapterId?:       string;
  label:            string;              // user-given display name
  type:             LearningSourceType;
  authorityLevel:   SourceAuthority;
  text:             string;              // pasted/fetched source content
  url?:             string;              // optional origin URL
  /** IDs of canonical thought units this source is linked to.
   *  Empty = book-level source (contributes to any unit); populated = unit-specific. */
  canonicalUnitIds: string[];
  thoughtUnits:     ExtractedThoughtUnit[];
  createdAt:        number;
  updatedAt?:       number;
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

/** Returns all sources for a book that are linked to a given canonical unit ID.
 *  Book-level sources (canonicalUnitIds empty) are included for every unit. */
export async function getSourcesForUnit(bookId: string, unitId: string): Promise<LearningSource[]> {
  const all = await loadSourcesForBook(bookId);
  return all.filter(s =>
    s.canonicalUnitIds.length === 0 || s.canonicalUnitIds.includes(unitId)
  ).sort((a, b) =>
    (AUTHORITY_PRIORITY[a.authorityLevel] ?? 99) - (AUTHORITY_PRIORITY[b.authorityLevel] ?? 99)
  );
}

/** Sync-read from localStorage — for callers that can't await (e.g. render-time init). */
export function getSourcesForBookSync(bookId: string): LearningSource[] {
  return lsGetAll().filter(r => r.bookId === bookId);
}

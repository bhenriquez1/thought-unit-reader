// lib/recalllab/recallStore.ts
// IndexedDB-first store for Recall Lab. Individual put/delete per set — no clear+put-all.
// IDs are stable (deterministic from bookId+pageNumber) so IDB put is a true upsert.

import { type NoteSubject, type UltraNote, inferSubject } from "@/lib/notelab/ultraNoteStore";
import type { UltraPageView } from "@/lib/insights/buildUltraPageView";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";

export type CardType = "core" | "definition" | "rule" | "reason" | "trap" | "contrast" | "formula" | "memory" | "fill-blank" | "cause-effect" | "application";
export type CardDifficulty = "easy" | "medium" | "hard";
export type SourceLabel = "right-panel" | "notelab";

export interface RecallCard {
  id: string;
  type: CardType;
  front: string;
  back: string;
  hint?: string;
  difficulty?: CardDifficulty;
  reviewCount: number;
  isMissed: boolean;
}

export interface RecallSet {
  id: string;
  bookId: string;
  bookTitle?: string;
  sourceLabel?: SourceLabel;
  pageNumber: number;
  subject: NoteSubject;
  topic: string;
  cards: RecallCard[];
  createdAt: number;
  sourceNoteId?: string;
}

const STORAGE_KEY   = "recallSets_v1";
const IDB_DB_NAME   = "avrrio_recall_v1";
const IDB_STORE_NAME = "sets";
const IDB_FLAG_KEY  = "recallSets_in_idb";

// ── Stable ID generation ────────────────────────────────────────────────────
// Deterministic: same book + page always produces the same ID.
// IDB keyPath:"id" turns put() into a true upsert — no clear() needed.

export function stableRecallId(bookId: string, pageNumber: number, suffix = ""): string {
  const safe = bookId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  return `rs-${safe}-p${pageNumber}${suffix ? `-${suffix}` : ""}`;
}

// ── Compact ─────────────────────────────────────────────────────────────────

function compact(set: RecallSet): RecallSet {
  return {
    ...set,
    cards: set.cards.slice(0, 25).map((c) => ({
      id: c.id,
      type: c.type,
      reviewCount: c.reviewCount,
      isMissed: c.isMissed,
      front: c.front.slice(0, 200),
      back: c.back.slice(0, 250),
      ...(c.hint ? { hint: c.hint.slice(0, 100) } : {}),
      ...(c.difficulty ? { difficulty: c.difficulty } : {}),
    })),
  };
}

// ── IDB helpers ─────────────────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Individual UPSERT — IDB handles overwrite via keyPath:"id" automatically
async function putToIDB(set: RecallSet): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).put(set);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Individual delete — only removes the one key
async function deleteFromIDB(id: string): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Bulk write — used for migration and Study Guide Lab bulk saves only
async function bulkWriteToIDB(sets: RecallSet[]): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_STORE_NAME);
    store.clear();
    for (const s of sets) store.put(s);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFromIDB(): Promise<RecallSet[]> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const req = tx.objectStore(IDB_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

// ── Load (IDB-first) ────────────────────────────────────────────────────────

async function loadAllAsync(): Promise<RecallSet[]> {
  if (typeof window === "undefined") return [];
  try {
    const idbSets = await loadFromIDB();
    if (idbSets.length > 0) {
      console.log("[RECALL_INDEXEDDB_READ]", { count: idbSets.length });
      console.log("[RECALL_STORAGE_DRIVER]", "indexeddb");
      return idbSets;
    }
  } catch (e) {
    console.warn("[RECALL_IDB_LOAD_FAIL]", String(e));
  }

  // IDB empty — try localStorage migration
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { console.log("[RECALL_STORAGE_DRIVER]", "empty"); return []; }
    const parsed = JSON.parse(raw);
    const lsSets: RecallSet[] = Array.isArray(parsed) ? parsed : [];
    if (lsSets.length > 0) {
      console.log("[RECALL_STORAGE_DRIVER]", "localstorage-migration", { count: lsSets.length });
      bulkWriteToIDB(lsSets)
        .then(() => { try { localStorage.setItem(IDB_FLAG_KEY, "1"); } catch {} })
        .catch(() => {});
    }
    return lsSets;
  } catch {
    return [];
  }
}

function loadFromLS(): RecallSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── LS mirror helpers ───────────────────────────────────────────────────────
// Keep localStorage as a cheap mirror for sync reads (RecallSession, etc.)

function lsUpsert(set: RecallSet): void {
  try {
    const all = loadFromLS();
    const idx = all.findIndex(s => s.id === set.id);
    if (idx >= 0) all[idx] = set; else all.unshift(set);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 300)));
  } catch { /* quota — LS mirror is best-effort */ }
}

function lsRemove(id: string): void {
  try {
    const all = loadFromLS().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* quota — LS mirror is best-effort */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getAllRecallSets(): RecallSet[] {
  return loadFromLS();
}

export async function getAllRecallSetsAsync(): Promise<RecallSet[]> {
  return loadAllAsync();
}

export function getRecallSetsByBook(bookId: string): RecallSet[] {
  return loadFromLS().filter((s) => s.bookId === bookId);
}

export async function isRecallSetPersisted(id: string): Promise<boolean> {
  const sets = await loadAllAsync();
  return sets.some((s) => s.id === id);
}

export async function saveRecallSet(set: RecallSet): Promise<void> {
  const c = compact(set);
  console.log("[RECALL_SAVE_KEY]", { id: c.id, bookId: c.bookId, page: c.pageNumber, cards: c.cards.length });

  // Delete any legacy entry for same book+page with a different (old random) ID
  const existing = await loadAllAsync();
  const dupIdx = existing.findIndex(s => s.bookId === c.bookId && s.pageNumber === c.pageNumber && s.id !== c.id);
  if (dupIdx >= 0) {
    const oldId = existing[dupIdx].id;
    console.log("[RECALL_DEDUPE_OLD_ID]", { oldId, newId: c.id });
    try { await deleteFromIDB(oldId); } catch { /* non-fatal */ }
    lsRemove(oldId);
  }

  // Upsert: IDB primary, LS mirror
  try {
    await putToIDB(c);
    try { localStorage.setItem(IDB_FLAG_KEY, "1"); } catch {}
    console.log("[RECALL_INDEXEDDB_WRITE]", { id: c.id });
    console.log("[RECALL_SAVE_SUCCESS]", { driver: "indexeddb", id: c.id });
  } catch (idbErr) {
    console.warn("[RECALL_IDB_PUT_FAIL]", String(idbErr), "→ LS fallback");
    try {
      lsUpsert(c);
      try { localStorage.removeItem(IDB_FLAG_KEY); } catch {}
      console.log("[RECALL_SAVE_SUCCESS]", { driver: "localStorage-fallback", id: c.id });
    } catch (lsErr) {
      console.error("[RECALL_ALL_STORAGE_FAIL]", { idb: String(idbErr), ls: String(lsErr) });
      throw new Error(`Recall save failed — IDB: ${String(idbErr)}`);
    }
  }

  // Read-back verification
  const readback = await loadAllAsync();
  const ok = readback.some(s => s.id === c.id);
  console.log(ok ? "[RECALL_SAVE_VERIFIED]" : "[RECALL_SAVE_VERIFY_FAIL]", {
    id: c.id, found: ok, totalInStore: readback.length,
  });
  if (!ok) throw new Error(`Recall set ${c.id} was not found in store after save.`);

  lsUpsert(c); // keep LS mirror up-to-date
  window.dispatchEvent(new Event("recall-lab-updated"));
  console.log("[RECALL_RENDER_COUNT]", { total: readback.length });
}

export async function deleteRecallSet(id: string): Promise<void> {
  // IDB individual delete — no clear() needed
  try {
    await deleteFromIDB(id);
    console.log("[RECALL_INDEXEDDB_WRITE]", { op: "delete", id });
  } catch (idbErr) {
    console.warn("[RECALL_IDB_DELETE_FAIL]", String(idbErr));
  }
  lsRemove(id);
  window.dispatchEvent(new Event("recall-lab-updated"));
}

export async function updateCardDifficulty(setId: string, cardId: string, difficulty: CardDifficulty): Promise<void> {
  const sets = await loadAllAsync();
  const set = sets.find((s) => s.id === setId);
  if (!set) return;
  const card = set.cards.find((c) => c.id === cardId);
  if (!card) return;
  card.difficulty = difficulty;
  card.reviewCount = (card.reviewCount ?? 0) + 1;
  card.isMissed = difficulty === "hard";
  const c = compact(set);
  try {
    await putToIDB(c);
  } catch {
    lsUpsert(c);
  }
}

// Bulk save — used only by Study Guide Lab and migration
export async function bulkSaveRecallSets(sets: RecallSet[]): Promise<void> {
  const compacted = sets.map(compact);
  try {
    await bulkWriteToIDB(compacted);
    try { localStorage.setItem(IDB_FLAG_KEY, "1"); } catch {}
    console.log("[RECALL_INDEXEDDB_WRITE]", { op: "bulk", count: compacted.length });
  } catch (idbErr) {
    console.warn("[RECALL_BULK_IDB_FAIL]", String(idbErr));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compacted.slice(0, 300)));
    } catch { /* quota */ }
  }
  window.dispatchEvent(new Event("recall-lab-updated"));
}

function card(id: string, type: CardType, front: string, back: string, hint?: string): RecallCard {
  return { id, type, front, back, hint, reviewCount: 0, isMissed: false };
}

export interface BuildRecallSetOpts {
  bookTitle?: string;
  sourceLabel?: SourceLabel;
  studyModel?: CurrentPageStudyModel;
}

export function buildRecallSetFromView(
  view: UltraPageView,
  bookId: string,
  pageNumber: number,
  opts?: BuildRecallSetOpts
): RecallSet {
  const { studyModel } = opts ?? {};
  const topic = view.title.replace(/^ULTRA\s*[–—-]\s*/i, "").trim() || `Page ${pageNumber}`;
  const cards: RecallCard[] = [];

  // OpenAI is the single source of truth. studyModel must be present — callers must gate.
  const thesis = studyModel?.pageThesis ?? "See page for core idea.";
  const miniTests = studyModel?.miniTest ?? [];
  const conceptSource: Array<{ title: string; pattern?: string; surgicalReason?: string; trap?: string; rule?: string }> =
    (studyModel?.conceptBlocks ?? []).map((b) => ({
      title:         b.title,
      pattern:       b.pattern,
      surgicalReason: b.mechanism,
      trap:          b.trap,
      rule:          b.rule,
    }));

  // 1. Page thesis card
  cards.push(card("core-0", "core",
    `What is the core idea of "${topic}"?`,
    thesis
  ));

  // 2. Study Notes cards — OpenAI professor-layer (whyThisMatters → examSignal)
  if (studyModel?.studyNotes) {
    const sn = studyModel.studyNotes;
    if (sn.whyThisMatters)   cards.push(card("sn-why",  "reason",     `Why does "${topic}" matter clinically or conceptually?`, sn.whyThisMatters));
    if (sn.keyMechanism)     cards.push(card("sn-mech", "definition", `What is the key mechanism of "${topic}"?`,               sn.keyMechanism));
    if (sn.commonConfusion)  cards.push(card("sn-conf", "trap",       `⚠️ What is the common confusion about "${topic}"?`,       sn.commonConfusion));
    if (sn.examSignal)       cards.push(card("sn-exam", "rule",       `What is the exam signal for "${topic}"?`,                sn.examSignal));
  }

  // 3. Mini-test cards — OpenAI professor questions (preferred over heuristic miniTest)
  miniTests.forEach((q, i) => {
    if (!q?.trim()) return;
    cards.push(card(`synth-q${i}`, "definition", q.trim(), thesis));
  });

  // 4. Per-concept cards from OpenAI-preferred source
  conceptSource.forEach((block, bi) => {
    const p = `b${bi + 1}`;
    const title = block.title;

    if (block.pattern) {
      const q = /^(what|define|state)/i.test(title)
        ? `${title}?`
        : `Define or state the pattern for: ${title}`;
      cards.push(card(`${p}-def`, "definition", q, block.pattern));
    }

    if (block.rule && block.rule !== block.pattern) {
      cards.push(card(`${p}-rule`, "rule",
        `State the rule for: ${title}`,
        block.rule,
        block.pattern || undefined
      ));
    }

    if (block.surgicalReason && block.surgicalReason !== block.pattern && block.surgicalReason !== block.rule) {
      cards.push(card(`${p}-why`, "reason",
        `Why does "${title}" work this way?`,
        block.surgicalReason,
        block.pattern || undefined
      ));
    }

    if (block.trap) {
      cards.push(card(`${p}-trap`, "trap",
        `⚠️ What is the common trap or misconception for: ${title}?`,
        block.trap
      ));
    }
  });

  // 5. Cause-effect card — from reasoningFlow A → B → C chain
  const reasoningFlow = studyModel?.studyNotes?.reasoningFlow;
  if (reasoningFlow && reasoningFlow.includes("→")) {
    const nodes = reasoningFlow.split(/\s*→\s*/).map((n) => n.trim()).filter(Boolean);
    if (nodes.length >= 2) {
      cards.push(card(
        "sn-flow", "cause-effect",
        `Trace the cause-effect chain for "${topic}":`,
        nodes.join(" → "),
      ));
    }
  }

  // 6. Application / checkpoint cards from miniTestItems (multiple-choice + short-answer)
  if (studyModel?.miniTestItems?.length) {
    for (const item of studyModel.miniTestItems) {
      let cardType: CardType;
      if (item.type === "fill-in-the-blank") {
        cardType = "fill-blank";
      } else if (item.type === "trap") {
        cardType = "trap";
      } else if (item.type === "multiple-choice" || item.type === "short-answer") {
        cardType = "application";
      } else {
        continue;
      }
      cards.push(card(
        `synth-${item.type}-p${pageNumber}-${cards.length}`,
        cardType,
        item.question,
        item.correctAnswer,
        item.explanation || undefined,
      ));
    }
  }

  const id = stableRecallId(bookId, pageNumber);
  return {
    id,
    bookId,
    bookTitle: opts?.bookTitle,
    sourceLabel: opts?.sourceLabel,
    pageNumber,
    subject: inferSubject(bookId),
    topic,
    cards,
    createdAt: Date.now(),
  };
}

export function buildRecallSetFromNote(note: UltraNote, opts?: BuildRecallSetOpts): RecallSet {
  const cards: RecallCard[] = [];

  // Core idea card — always created
  const coreIdea = note.coreIdea || "See note for core idea.";
  cards.push(card("core-0", "core",
    `What is the core idea of "${note.topic}"?`,
    coreIdea
  ));

  note.concepts.forEach((c, ci) => {
    const p = `n${ci + 1}`;
    if (c.pattern) {
      cards.push(card(`${p}-def`, "definition",
        `Define or state the pattern for: ${c.title}`,
        c.pattern
      ));
    }
    if (c.rule && c.rule !== c.pattern) {
      cards.push(card(`${p}-rule`, "rule",
        `State the rule for: ${c.title}`,
        c.rule,
        c.surgicalReason || undefined
      ));
    }
    if (c.surgicalReason && c.surgicalReason !== c.pattern && c.surgicalReason !== c.rule) {
      cards.push(card(`${p}-why`, "reason",
        `Why does "${c.title}" work this way?`,
        c.surgicalReason
      ));
    }
    if (c.trap) {
      cards.push(card(`${p}-trap`, "trap",
        `⚠️ What is the trap for: ${c.title}?`,
        c.trap
      ));
    }
  });

  note.memoryShortcuts.forEach((s, i) => {
    cards.push(card(`mem-${i}`, "memory", "Complete the memory shortcut:", s));
  });

  const id = stableRecallId(note.bookId, note.pageNumber, "note");
  return {
    id,
    bookId: note.bookId,
    bookTitle: note.bookTitle ?? opts?.bookTitle,
    sourceLabel: opts?.sourceLabel ?? "notelab",
    pageNumber: note.pageNumber,
    subject: note.subject ?? "General Notes",
    topic: note.topic,
    cards,
    createdAt: Date.now(),
    sourceNoteId: note.id,
  };
}

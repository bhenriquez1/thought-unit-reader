// lib/recalllab/recallStore.ts
// IDB-primary recall set store. localStorage is a cheap sync-read mirror only.
// Schema: object store "sets" with keyPath "id" — every put() must provide set.id.

import { type NoteSubject, type UltraNote, inferSubject } from "@/lib/notelab/ultraNoteStore";
import type { UltraPageView } from "@/lib/insights/buildUltraPageView";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { ThoughtUnitDetail } from "@/lib/insights/buildThoughtUnitDetail";

export type CardType = "core" | "definition" | "rule" | "reason" | "trap" | "contrast" | "formula" | "memory" | "fill-blank" | "cause-effect" | "application";
export type CardDifficulty = "easy" | "medium" | "hard";
export type SourceLabel = "right-panel" | "notelab" | "explain-step";

export interface RecallCard {
  id: string;
  type: CardType;
  front: string;
  back: string;
  hint?: string;
  /** Weak-topic tag shown as a small chip on the card (e.g. concept title). */
  tag?: string;
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

// ── Constants ──────────────────────────────────────────────────────────────

// New DB name avoids inheriting a broken schema from an old version-1 database.
const IDB_DB_NAME    = "avrrio_recall_v2";
const IDB_STORE_NAME = "sets";
const LS_MIRROR_KEY  = "recallSets_mirror_v2";

// ── Stable ID ─────────────────────────────────────────────────────────────

/** Deterministic ID — same input always produces the same key, enabling true IDB upserts. */
export function stableRecallId(bookId: string, pageNumber: number, suffix = ""): string {
  const safe = bookId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  return `rs-${safe}-p${pageNumber}${suffix ? `-${suffix}` : ""}`;
}

// ── Compact ────────────────────────────────────────────────────────────────

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
      ...(c.hint       ? { hint: c.hint.slice(0, 100) }   : {}),
      ...(c.difficulty ? { difficulty: c.difficulty }       : {}),
    })),
  };
}

// ── IDB helpers ────────────────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB blocked"));
  });
}

async function idbPut(set: RecallSet): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_STORE_NAME);
    const req   = store.put(set); // keyPath="id" — no out-of-line key needed
    req.onsuccess = () => {};
    req.onerror   = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGetAll(): Promise<RecallSet[]> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE_NAME, "readonly");
    const req = tx.objectStore(IDB_STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as RecallSet[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(id: string): Promise<RecallSet | undefined> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE_NAME, "readonly");
    const req = tx.objectStore(IDB_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as RecallSet | undefined);
    req.onerror   = () => reject(req.error);
  });
}

// ── localStorage mirror (sync read, best-effort write) ────────────────────

function lsRead(): RecallSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function lsWrite(sets: RecallSet[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_MIRROR_KEY, JSON.stringify(sets.slice(0, 100).map(compact)));
  } catch {
    // Quota exceeded — mirror is optional, IDB is primary
  }
}

function lsUpsert(set: RecallSet): void {
  const all = lsRead();
  const idx = all.findIndex((s) => s.id === set.id);
  if (idx >= 0) all[idx] = set; else all.unshift(set);
  lsWrite(all);
}

function lsRemove(id: string): void {
  lsWrite(lsRead().filter((s) => s.id !== id));
}

// ── Public async read ──────────────────────────────────────────────────────

export async function getAllRecallSetsAsync(): Promise<RecallSet[]> {
  try {
    const sets = await idbGetAll();
    console.log("[RECALL_IDB_READ]", { count: sets.length, driver: "indexeddb" });
    return sets;
  } catch (e) {
    console.warn("[RECALL_IDB_READ_FAIL]", String(e), "— falling back to localStorage mirror");
    return lsRead();
  }
}

// ── Public sync read (uses LS mirror — for legacy callers) ─────────────────

export function getAllRecallSets(): RecallSet[] {
  return lsRead();
}

export function getRecallSetsByBook(bookId: string): RecallSet[] {
  return lsRead().filter((s) => s.bookId === bookId);
}

// ── Save ───────────────────────────────────────────────────────────────────

export async function saveRecallSet(set: RecallSet): Promise<void> {
  const c = compact(set);
  console.log("[RECALL_SAVE_START]", { id: c.id, bookId: c.bookId, page: c.pageNumber, cards: c.cards.length });
  console.log("[RECALL_SET_ID]", c.id);

  // Remove legacy entries for same book+page with a DIFFERENT id (old non-stable IDs)
  try {
    const existing = await idbGetAll();
    const stale = existing.filter(
      (s) => s.bookId === c.bookId && s.pageNumber === c.pageNumber && s.id !== c.id
    );
    for (const s of stale) {
      await idbDelete(s.id);
      lsRemove(s.id);
      console.log("[RECALL_STALE_REMOVED]", { oldId: s.id });
    }
  } catch { /* non-fatal — still try to save */ }

  // Primary: IDB
  try {
    await idbPut(c);
    console.log("[RECALL_IDB_PUT]", { id: c.id, cards: c.cards.length });
  } catch (idbErr) {
    console.error("[RECALL_SAVE_FAILED]", { driver: "indexeddb", id: c.id, error: String(idbErr) });
    // Fall through to localStorage-only path
    lsUpsert(c);
    window.dispatchEvent(new Event("recall-lab-updated"));
    return;
  }

  // Verify the write by reading back
  try {
    const readback = await idbGet(c.id);
    if (!readback) {
      throw new Error(`Read-back check failed — id ${c.id} not found after put()`);
    }
    console.log("[RECALL_IDB_READ]", { id: c.id, cards: readback.cards.length, verified: true });
  } catch (verifyErr) {
    console.error("[RECALL_SAVE_FAILED]", { stage: "readback", id: c.id, error: String(verifyErr) });
    throw verifyErr;
  }

  // Mirror to localStorage for sync reads
  lsUpsert(c);

  console.log("[RECALL_SAVE_SUCCESS]", { driver: "indexeddb", id: c.id, cards: c.cards.length });

  // Notify RecallLab to re-render
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("recall-lab-updated"));
  }

  // Log total count
  try {
    const all = await idbGetAll();
    console.log("[RECALL_RENDER_COUNT]", { total: all.length });
  } catch { /* non-fatal */ }
}

export async function bulkSaveRecallSets(sets: RecallSet[]): Promise<void> {
  for (const s of sets) await saveRecallSet(s);
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteRecallSet(id: string): Promise<void> {
  try {
    await idbDelete(id);
  } catch (e) {
    console.warn("[RECALL_IDB_DELETE_FAIL]", String(e));
  }
  lsRemove(id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("recall-lab-updated"));
  }
}

// ── Update card difficulty ─────────────────────────────────────────────────

export async function updateCardDifficulty(setId: string, cardId: string, difficulty: CardDifficulty): Promise<void> {
  // Read from IDB (authoritative); fall back to the LS mirror if IDB is unavailable
  // so a rating made while IDB is down still has a set object to mutate.
  let set: RecallSet | undefined;
  try {
    set = await idbGet(setId);
  } catch (e) {
    console.warn("[RECALL_UPDATE_IDB_GET_FAIL]", String(e), "— falling back to localStorage mirror");
  }
  if (!set) {
    set = lsRead().find((s) => s.id === setId);
  }
  if (!set) {
    console.error("[RECALL_UPDATE_CARD_FAIL]", { reason: "set-not-found", setId, cardId });
    return;
  }

  const card = set.cards.find((c) => c.id === cardId);
  if (!card) {
    console.error("[RECALL_UPDATE_CARD_FAIL]", { reason: "card-not-found", setId, cardId });
    return;
  }

  card.difficulty  = difficulty;
  card.reviewCount = (card.reviewCount ?? 0) + 1;
  card.isMissed    = difficulty === "hard";

  // Best-effort IDB write — failure here must not lose the rating.
  try {
    await idbPut(set);
    console.log("[RECALL_UPDATE_CARD_SUCCESS]", { setId, cardId, difficulty, driver: "indexeddb" });
  } catch (e) {
    console.error("[RECALL_UPDATE_CARD_IDB_FAIL]", { setId, cardId, error: String(e) }, "— falling back to localStorage mirror");
  }

  // Always mirror to localStorage so the rating survives reload even if IDB failed.
  lsUpsert(set);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("recall-lab-updated"));
  }
}

// ── isRecallSetPersisted ───────────────────────────────────────────────────

export async function isRecallSetPersisted(id: string): Promise<boolean> {
  try {
    const found = await idbGet(id);
    return !!found;
  } catch {
    return lsRead().some((s) => s.id === id);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function card(id: string, type: CardType, front: string, back: string, hint?: string): RecallCard {
  return { id, type, front, back, hint, reviewCount: 0, isMissed: false };
}

// ── Build from Right Panel view ────────────────────────────────────────────

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

  const thesis = studyModel?.pageThesis ?? "See page for core idea.";
  const miniTests = studyModel?.miniTest ?? [];
  const conceptSource = (studyModel?.conceptBlocks ?? []).map((b) => ({
    title: b.title, pattern: b.pattern, surgicalReason: b.mechanism, trap: b.trap, rule: b.rule,
  }));

  cards.push(card("core-0", "core", `What is the core idea of "${topic}"?`, thesis));

  if (studyModel?.studyNotes) {
    const sn = studyModel.studyNotes;
    if (sn.whyThisMatters)  cards.push(card("sn-why",  "reason",     `Why does "${topic}" matter clinically or conceptually?`, sn.whyThisMatters));
    if (sn.keyMechanism)    cards.push(card("sn-mech", "definition", `What is the key mechanism of "${topic}"?`,               sn.keyMechanism));
    if (sn.commonConfusion) cards.push(card("sn-conf", "trap",       `⚠️ What is the common confusion about "${topic}"?`,       sn.commonConfusion));
    if (sn.examSignal)      cards.push(card("sn-exam", "rule",       `What is the exam signal for "${topic}"?`,                sn.examSignal));
  }

  miniTests.forEach((q, i) => {
    if (!q?.trim()) return;
    cards.push(card(`synth-q${i}`, "definition", q.trim(), thesis));
  });

  conceptSource.forEach((block, bi) => {
    const p = `b${bi + 1}`;
    if (block.pattern) {
      const q = /^(what|define|state)/i.test(block.title) ? `${block.title}?` : `Define or state the pattern for: ${block.title}`;
      cards.push(card(`${p}-def`, "definition", q, block.pattern));
    }
    if (block.rule && block.rule !== block.pattern)
      cards.push(card(`${p}-rule`, "rule", `State the rule for: ${block.title}`, block.rule, block.pattern || undefined));
    if (block.surgicalReason && block.surgicalReason !== block.pattern && block.surgicalReason !== block.rule)
      cards.push(card(`${p}-why`, "reason", `Why does "${block.title}" work this way?`, block.surgicalReason, block.pattern || undefined));
    if (block.trap)
      cards.push(card(`${p}-trap`, "trap", `⚠️ What is the common trap for: ${block.title}?`, block.trap));
  });

  const reasoningFlow = studyModel?.studyNotes?.reasoningFlow;
  if (reasoningFlow?.includes("→")) {
    const nodes = reasoningFlow.split(/\s*→\s*/).map((n) => n.trim()).filter(Boolean);
    if (nodes.length >= 2)
      cards.push(card("sn-flow", "cause-effect", `Trace the cause-effect chain for "${topic}":`, nodes.join(" → ")));
  }

  if (studyModel?.miniTestItems?.length) {
    for (const item of studyModel.miniTestItems) {
      let cardType: CardType;
      if (item.type === "fill-in-the-blank")           cardType = "fill-blank";
      else if (item.type === "trap")                   cardType = "trap";
      else if (item.type === "multiple-choice" || item.type === "short-answer") cardType = "application";
      else continue;
      cards.push(card(`synth-${item.type}-p${pageNumber}-${cards.length}`, cardType, item.question, item.correctAnswer, item.explanation || undefined));
    }
  }

  return {
    id:          stableRecallId(bookId, pageNumber),
    bookId,
    bookTitle:   opts?.bookTitle,
    sourceLabel: opts?.sourceLabel,
    pageNumber,
    subject:     inferSubject(bookId),
    topic,
    cards,
    createdAt:   Date.now(),
  };
}

// ── Build from NoteLab note ────────────────────────────────────────────────

export function buildRecallSetFromNote(note: UltraNote, opts?: BuildRecallSetOpts): RecallSet {
  const cards: RecallCard[] = [];

  cards.push(card("core-0", "core", `What is the core idea of "${note.topic}"?`, note.coreIdea || "See note for core idea."));

  note.concepts.forEach((c, ci) => {
    const p = `n${ci + 1}`;
    if (c.pattern)
      cards.push(card(`${p}-def`, "definition", `Define or state the pattern for: ${c.title}`, c.pattern));
    if (c.rule && c.rule !== c.pattern)
      cards.push(card(`${p}-rule`, "rule", `State the rule for: ${c.title}`, c.rule, c.surgicalReason || undefined));
    if (c.surgicalReason && c.surgicalReason !== c.pattern && c.surgicalReason !== c.rule)
      cards.push(card(`${p}-why`, "reason", `Why does "${c.title}" work this way?`, c.surgicalReason));
    if (c.trap)
      cards.push(card(`${p}-trap`, "trap", `⚠️ What is the trap for: ${c.title}?`, c.trap));
  });

  note.memoryShortcuts.forEach((s, i) => {
    cards.push(card(`mem-${i}`, "memory", "Complete the memory shortcut:", s));
  });

  return {
    id:           stableRecallId(note.bookId, note.pageNumber, "note"),
    bookId:       note.bookId,
    bookTitle:    note.bookTitle ?? opts?.bookTitle,
    sourceLabel:  opts?.sourceLabel ?? "notelab",
    pageNumber:   note.pageNumber,
    subject:      note.subject ?? "General Notes",
    topic:        note.topic,
    cards,
    createdAt:    Date.now(),
    sourceNoteId: note.id,
  };
}

// ── Build from a single Thought Unit (Recall Lab v2 "Quiz Me") ────────────
// Scoped to one VisualAnchor's expanded detail rather than the whole page —
// the synthetic set is built in-memory for an immediate quiz session and is
// not persisted, so it doesn't clutter the dashboard.

export function buildRecallSetFromThoughtUnit(detail: ThoughtUnitDetail, opts?: BuildRecallSetOpts): RecallSet {
  const cards: RecallCard[] = [];

  cards.push(card("tu-recall", "core", detail.recallCard.front, detail.recallCard.back));

  if (detail.mechanism && detail.mechanism !== detail.recallCard.back)
    cards.push(card("tu-mech", "definition", `What is the mechanism behind: ${detail.title}?`, detail.mechanism));
  if (detail.commonConfusion && detail.commonConfusion !== detail.recallCard.back)
    cards.push(card("tu-conf", "trap", `⚠️ What is the common confusion about: ${detail.title}?`, detail.commonConfusion));
  if (detail.examTrap && detail.examTrap !== detail.recallCard.back)
    cards.push(card("tu-trap", "trap", `⚠️ What is the exam trap for: ${detail.title}?`, detail.examTrap));
  if (detail.datFact && detail.datFact !== detail.recallCard.back)
    cards.push(card("tu-dat", "rule", `What is the DAT high-yield fact for: ${detail.title}?`, detail.datFact));

  return {
    id:          stableRecallId(detail.bookId, detail.pageNumber, `tu-${detail.evidenceRefId}`),
    bookId:      detail.bookId,
    bookTitle:   opts?.bookTitle,
    sourceLabel: opts?.sourceLabel ?? "right-panel",
    pageNumber:  detail.pageNumber,
    subject:     inferSubject(detail.bookId),
    topic:       detail.title,
    cards,
    createdAt:   Date.now(),
  };
}

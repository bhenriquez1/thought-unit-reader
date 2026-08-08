// lib/recalllab/recallStore.ts
// IDB-primary recall set store. localStorage is a cheap sync-read mirror only.
// Schema: object store "sets" with keyPath "id" — every put() must provide set.id.

import { type NoteSubject, type UltraNote, inferSubject } from "@/lib/notelab/ultraNoteStore";
import type { UltraPageView } from "@/lib/insights/buildUltraPageView";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { ThoughtUnitDetail } from "@/lib/insights/buildThoughtUnitDetail";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import { getNodeProgress, saveNodeProgress } from "@/lib/knowledge/knowledgeGraphStore";
import { applyLearningEvent, emptyProgress } from "@/lib/knowledge/learningStateEvents";

export type CardType = "fact" | "concept" | "mechanism" | "application" | "dat-question" | "weak-review";
export type CardDifficulty = "easy" | "medium" | "hard";
export type SourceLabel = "right-panel" | "notelab" | "explain-step" | "study-guide" | "weak-review" | "teach-canvas";

/** Lightweight mastery-state progression — NOT an interval/due-date spaced-repetition
 *  scheduler. Derived from rating streaks; see deriveSrsState / nextSrsState below. */
export type SrsState = "new" | "learning" | "review" | "mastered";

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
  /** Set when this card is a copy surfaced in a synthetic set (e.g. Weak Topics Review) —
   *  ratings made here should write back to the real set/card they came from. */
  originSetId?: string;
  originCardId?: string;
  /** Explicit lifecycle state — undefined on legacy cards; use deriveSrsState() to read. */
  srsState?: SrsState;
  lastReviewedAt?: number;
  /** Consecutive non-"hard" ratings — resets to 0 on "hard"; drives srsState progression. */
  correctStreak?: number;
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
  // Resolved document identity (lib/insights/resolveDocumentIdentity.ts) —
  // back-filled incrementally like knowledgeNodeId below, never required.
  // Distinct from bookId (filename-derived) for the same reason
  // KnowledgeNode.documentId is distinct from KnowledgeNode.bookId.
  documentId?: string;
  // Knowledge Graph reference (KG PR 1) — back-filled incrementally, never required.
  knowledgeNodeId?: string;
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
      ...(c.srsState        ? { srsState: c.srsState }             : {}),
      ...(c.lastReviewedAt  ? { lastReviewedAt: c.lastReviewedAt } : {}),
      ...(c.correctStreak   ? { correctStreak: c.correctStreak }   : {}),
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
    return await idbGetAll();
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
  let c = compact(set);

  // Remove legacy entries for same book+page with a DIFFERENT id (old non-stable,
  // pre-"rs-" IDs). Every current producer (stableRecallId, MiniTestPanel's missed-
  // set IDs, etc.) emits an "rs-"-prefixed ID, and several features intentionally
  // keep multiple "rs-"-prefixed sets per book+page (e.g. a sticky-note set, a
  // thought-unit set, and a missed-questions set can all coexist on one page).
  // Only ids that don't even match that modern scheme are true legacy debris.
  let prior: RecallSet | undefined;
  try {
    const existing = await idbGetAll();
    const stale = existing.filter(
      (s) => s.bookId === c.bookId && s.pageNumber === c.pageNumber && s.id !== c.id && !s.id.startsWith("rs-")
    );
    for (const s of stale) {
      await idbDelete(s.id);
      lsRemove(s.id);
    }
    prior = existing.find((s) => s.id === c.id);
  } catch { /* non-fatal — still try to save */ }

  // Preserve SRS review history when regenerating cards for the same page.
  // Card IDs are deterministic (stable prefix + ordinal), so we match by id.
  if (prior) {
    const srsMap = new Map(
      prior.cards.map((card) => [
        card.id,
        {
          reviewCount: card.reviewCount,
          isMissed: card.isMissed,
          srsState: card.srsState,
          lastReviewedAt: card.lastReviewedAt,
          correctStreak: card.correctStreak,
          difficulty: card.difficulty,
        } satisfies Partial<RecallCard>,
      ])
    );
    c = {
      ...c,
      cards: c.cards.map((card) => {
        const saved = srsMap.get(card.id);
        if (!saved) return card;
        return {
          ...card,
          reviewCount: Math.max(card.reviewCount, saved.reviewCount),
          isMissed: saved.isMissed,
          ...(saved.srsState        ? { srsState: saved.srsState }               : {}),
          ...(saved.lastReviewedAt  ? { lastReviewedAt: saved.lastReviewedAt }   : {}),
          ...(saved.correctStreak   ? { correctStreak: saved.correctStreak }     : {}),
          ...(saved.difficulty      ? { difficulty: saved.difficulty }           : {}),
        };
      }),
    };
  }

  // Primary: IDB
  try {
    await idbPut(c);
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
  } catch (verifyErr) {
    console.error("[RECALL_SAVE_FAILED]", { stage: "readback", id: c.id, error: String(verifyErr) });
    throw verifyErr;
  }

  // Mirror to localStorage for sync reads
  lsUpsert(c);

  // Notify RecallLab to re-render
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("recall-lab-updated"));
  }
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

  card.difficulty     = difficulty;
  card.reviewCount    = (card.reviewCount ?? 0) + 1;
  card.isMissed       = difficulty === "hard";
  card.lastReviewedAt = Date.now();
  card.correctStreak  = difficulty === "hard" ? 0 : (card.correctStreak ?? 0) + 1;
  card.srsState       = nextSrsState(card.correctStreak);

  // Best-effort IDB write — failure here must not lose the rating.
  try {
    await idbPut(set);
    console.log("[RECALL_UPDATE_CARD_SUCCESS]", { setId, cardId, difficulty, driver: "indexeddb" });
  } catch (e) {
    console.error("[RECALL_UPDATE_CARD_IDB_FAIL]", { setId, cardId, error: String(e) }, "— falling back to localStorage mirror");
  }

  // Always mirror to localStorage so the rating survives reload even if IDB failed.
  lsUpsert(set);

  // Write KnowledgeNodeProgress if this set is linked to a KnowledgeNode —
  // via the deterministic event reducer (learningStateEvents.ts), not a
  // hand-rolled patch, so this write shares the exact same logic every other
  // module (Whiteboard, DAT Apex) will use once they're wired in later phases.
  if (set.knowledgeNodeId) {
    const nodeId = set.knowledgeNodeId;
    const occurredAt = new Date().toISOString();
    getNodeProgress(nodeId)
      .then((existing) => {
        const base = existing ?? emptyProgress(nodeId, set.documentId ?? set.bookId);
        const next = applyLearningEvent(base, { kind: "recall-graded", difficulty, occurredAt, sourceId: cardId });
        return saveNodeProgress(next);
      })
      .catch((err) => {
        console.error("[KG_PROGRESS_WRITE_FAIL]", { nodeId, error: err instanceof Error ? err.message : String(err) });
      });
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("recall-lab-updated"));
  }
}

// ── Lifecycle state (New / Learning / Review / Mastered) ──────────────────
// Streak-based mastery progression, not an interval/due-date scheduler —
// a card advances Learning → Review → Mastered after 2 / 4 consecutive
// non-"hard" ratings, and drops straight back to Learning on any "hard".

function nextSrsState(correctStreak: number): SrsState {
  if (correctStreak >= 4) return "mastered";
  if (correctStreak >= 2) return "review";
  return "learning";
}

/** Reads the explicit srsState when present; otherwise infers one from legacy
 *  review history so cards persisted before this field existed still display sensibly. */
export function deriveSrsState(c: RecallCard): SrsState {
  if (c.srsState) return c.srsState;
  if ((c.reviewCount ?? 0) === 0) return "new";
  if (c.difficulty === "hard" || c.isMissed) return "learning";
  return nextSrsState(c.reviewCount ?? 0);
}

export interface DeckStats {
  total: number;
  new: number;
  learning: number;
  review: number;
  mastered: number;
  masteryPct: number;
}

export function computeDeckStats(cards: RecallCard[]): DeckStats {
  const counts = { new: 0, learning: 0, review: 0, mastered: 0 };
  for (const c of cards) counts[deriveSrsState(c)]++;
  const total = cards.length;
  const masteryPct = total > 0 ? Math.round((counts.mastered / total) * 100) : 0;
  return { total, ...counts, masteryPct };
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
  /** Scope buildRecallSetFromNote to just these concept ordinals instead of the whole note. */
  conceptOrdinals?: number[];
  /** Resolved document identity — see RecallSet.documentId. */
  documentId?: string;
  /** The page's primary KnowledgeNode id, when already resolved (e.g.
   *  pageKgNodeIdRef.current in pages/index.tsx) — threading this through is
   *  what makes updateCardDifficulty() actually write to Learning State for
   *  this set (Speech/Learning-State-Engine Phase A, RC "Reader→Recall save
   *  button never threads knowledgeNodeId"). */
  knowledgeNodeId?: string | null;
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

  cards.push(card("core-0", "concept", `What is the core idea of "${topic}"?`, thesis));

  if (studyModel?.studyNotes) {
    const sn = studyModel.studyNotes;
    if (sn.whyThisMatters)  cards.push(card("sn-why",  "application", `Why does "${topic}" matter clinically or conceptually?`, sn.whyThisMatters));
    if (sn.keyMechanism)    cards.push(card("sn-mech", "mechanism",   `What is the key mechanism of "${topic}"?`,               sn.keyMechanism));
    if (sn.commonConfusion) cards.push(card("sn-conf", "concept",     `⚠️ What is the common confusion about "${topic}"?`,       sn.commonConfusion));
    if (sn.examSignal)      cards.push(card("sn-exam", "fact",        `What is the exam signal for "${topic}"?`,                sn.examSignal));
  }

  miniTests.forEach((q, i) => {
    if (!q?.trim()) return;
    cards.push(card(`synth-q${i}`, "concept", q.trim(), thesis));
  });

  conceptSource.forEach((block, bi) => {
    const p = `b${bi + 1}`;
    if (block.pattern) {
      const q = /^(what|define|state)/i.test(block.title) ? `${block.title}?` : `Define or state the pattern for: ${block.title}`;
      cards.push(card(`${p}-def`, "concept", q, block.pattern));
    }
    if (block.rule && block.rule !== block.pattern)
      cards.push(card(`${p}-rule`, "fact", `State the rule for: ${block.title}`, block.rule, block.pattern || undefined));
    if (block.surgicalReason && block.surgicalReason !== block.pattern && block.surgicalReason !== block.rule)
      cards.push(card(`${p}-why`, "mechanism", `Why does "${block.title}" work this way?`, block.surgicalReason, block.pattern || undefined));
    if (block.trap)
      cards.push(card(`${p}-trap`, "concept", `⚠️ What is the common trap for: ${block.title}?`, block.trap));
  });

  const reasoningFlow = studyModel?.studyNotes?.reasoningFlow;
  if (reasoningFlow?.includes("→")) {
    const nodes = reasoningFlow.split(/\s*→\s*/).map((n) => n.trim()).filter(Boolean);
    if (nodes.length >= 2)
      cards.push(card("sn-flow", "mechanism", `Trace the cause-effect chain for "${topic}":`, nodes.join(" → ")));
  }

  if (studyModel?.miniTestItems?.length) {
    for (const item of studyModel.miniTestItems) {
      let cardType: CardType;
      if (item.type === "fill-in-the-blank")           cardType = "fact";
      else if (item.type === "trap")                   cardType = "concept";
      else if (item.type === "multiple-choice" || item.type === "short-answer") cardType = "dat-question";
      else continue;
      cards.push(card(`synth-${item.type}-p${pageNumber}-${cards.length}`, cardType, item.question, item.correctAnswer, item.explanation || undefined));
    }
  }

  return {
    id:          stableRecallId(bookId, pageNumber),
    bookId,
    documentId:  opts?.documentId,
    bookTitle:   opts?.bookTitle,
    sourceLabel: opts?.sourceLabel,
    pageNumber,
    subject:     inferSubject(bookId),
    topic,
    cards,
    createdAt:   Date.now(),
    knowledgeNodeId: opts?.knowledgeNodeId ?? undefined,
  };
}

// ── Build from NoteLab note ────────────────────────────────────────────────

export function buildRecallSetFromNote(note: UltraNote, opts?: BuildRecallSetOpts): RecallSet {
  const cards: RecallCard[] = [];

  cards.push(card("core-0", "concept", `What is the core idea of "${note.topic}"?`, note.coreIdea || "See note for core idea."));

  const concepts = opts?.conceptOrdinals?.length
    ? note.concepts.filter((c) => opts.conceptOrdinals!.includes(c.ordinal))
    : note.concepts;

  concepts.forEach((c, ci) => {
    const p = `n${ci + 1}`;
    if (c.pattern)
      cards.push(card(`${p}-def`, "concept", `Define or state the pattern for: ${c.title}`, c.pattern));
    if (c.rule && c.rule !== c.pattern)
      cards.push(card(`${p}-rule`, "fact", `State the rule for: ${c.title}`, c.rule, c.surgicalReason || undefined));
    if (c.surgicalReason && c.surgicalReason !== c.pattern && c.surgicalReason !== c.rule)
      cards.push(card(`${p}-why`, "mechanism", `Why does "${c.title}" work this way?`, c.surgicalReason));
    if (c.trap)
      cards.push(card(`${p}-trap`, "concept", `⚠️ What is the trap for: ${c.title}?`, c.trap));
  });

  note.memoryShortcuts.forEach((s, i) => {
    cards.push(card(`mem-${i}`, "fact", "Complete the memory shortcut:", s));
  });

  return {
    id:           stableRecallId(
      note.bookId,
      note.pageNumber,
      opts?.conceptOrdinals?.length ? `note-${note.id}-c${opts.conceptOrdinals.join("-")}` : `note-${note.id}`
    ),
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

// ── Build from a single Adaptive Notebook card ("Generate Card" action) ───
// Scoped to one NoteCard rather than the whole note, mirroring
// buildRecallSetFromThoughtUnit's single-anchor scoping — built in-memory,
// not persisted by this function (caller decides whether to save).

export function buildRecallSetFromNoteCard(note: UltraNote, noteCard: NoteCard, opts?: BuildRecallSetOpts): RecallSet {
  const cardType: CardType =
    noteCard.type === "mechanism" ? "mechanism"
    : noteCard.type === "dat_trap" || noteCard.type === "common_mistake" || noteCard.type === "complication_risk" ? "concept"
    : noteCard.type === "why_this_matters" ? "application"
    : "fact";

  const cards: RecallCard[] = [
    card(`nc-${noteCard.type}`, cardType, `${noteCard.title}?`, noteCard.body),
  ];

  return {
    id:           stableRecallId(note.bookId, note.pageNumber, `notecard-${note.id}-${noteCard.type}`),
    bookId:       note.bookId,
    bookTitle:    note.bookTitle ?? opts?.bookTitle,
    sourceLabel:  opts?.sourceLabel ?? "notelab",
    pageNumber:   note.pageNumber,
    subject:      note.subject ?? "General Notes",
    topic:        noteCard.title,
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

  cards.push(card("tu-recall", "concept", detail.recallCard.front, detail.recallCard.back));

  if (detail.mechanism && detail.mechanism !== detail.recallCard.back)
    cards.push(card("tu-mech", "mechanism", `What is the mechanism behind: ${detail.title}?`, detail.mechanism));
  if (detail.commonConfusion && detail.commonConfusion !== detail.recallCard.back)
    cards.push(card("tu-conf", "concept", `⚠️ What is the common confusion about: ${detail.title}?`, detail.commonConfusion));
  if (detail.examTrap && detail.examTrap !== detail.recallCard.back)
    cards.push(card("tu-trap", "concept", `⚠️ What is the exam trap for: ${detail.title}?`, detail.examTrap));
  if (detail.datFact && detail.datFact !== detail.recallCard.back)
    cards.push(card("tu-dat", "fact", `What is the DAT high-yield fact for: ${detail.title}?`, detail.datFact));

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

// ── Build a Weak Topics review set (real missed-card aggregation) ─────────
// Pulls every card across the given sets that's actually been missed
// (isMissed, or rated "hard") — not a fallback generator, just a fresh
// session over real review history. Built in-memory like
// buildRecallSetFromThoughtUnit, so re-running it always reflects the
// current miss state instead of going stale in storage. `sets` is expected
// to already be scoped to the relevant book(s) by the caller.

export function buildWeakTopicReviewSet(
  sets: RecallSet[],
  opts?: BuildRecallSetOpts
): RecallSet | null {
  const missed = sets.flatMap((s) =>
    s.cards.filter((c) => c.isMissed || c.difficulty === "hard").map((c) => ({ setId: s.id, setTopic: s.topic, c }))
  );

  if (missed.length === 0) return null;

  const bookId = sets[0]?.bookId ?? "all";
  const cards: RecallCard[] = missed.slice(0, 30).map(({ setId, setTopic, c }, i) => ({
    ...c,
    id: `weak-${i}-${c.id}`,
    type: "weak-review",
    tag: c.tag ?? setTopic,
    originSetId: setId,
    originCardId: c.id,
  }));

  return {
    id:          `rs-${bookId}-weak-review`,
    bookId,
    bookTitle:   opts?.bookTitle,
    sourceLabel: "weak-review",
    pageNumber:  0,
    subject:     inferSubject(bookId),
    topic:       "Weak Topics Review",
    cards,
    createdAt:   Date.now(),
  };
}

// ── Build from Teaching Canvas sequence (Adaptive Teaching Engine → Recall) ──
// Converts NoteCard[] from the Teaching Canvas into a single in-memory RecallSet.
// Not persisted by this function — caller decides whether to save.

export function buildRecallSetFromTeachingSequence(
  noteCards: NoteCard[],
  opts: {
    bookId: string;
    bookTitle?: string;
    pageNumber: number;
    pageTitle?: string | null;
    knowledgeNodeId?: string | null;
    subject?: NoteSubject;
  }
): RecallSet {
  const cardTypeOf = (type: NoteCard["type"]): CardType =>
    type === "mechanism" || type === "procedure_flow" || type === "formula_breakdown" ? "mechanism"
    : type === "dat_trap" || type === "common_mistake" || type === "complication_risk" || type === "exam_strategy" ? "concept"
    : type === "why_this_matters" || type === "clinical_reasoning" || type === "clinical_pearl" ? "application"
    : type === "recall_questions" || type === "quick_review" ? "fact"
    : "concept";

  const frontOf = (nc: NoteCard): string => {
    if (nc.type === "recall_questions" || nc.type === "quick_review") return `Quiz: ${nc.title}`;
    if (nc.type === "dat_trap" || nc.type === "exam_strategy") return `Watch out: what is the trap with "${nc.title}"?`;
    if (nc.type === "mechanism" || nc.type === "procedure_flow") return `Explain the mechanism: ${nc.title}`;
    if (nc.type === "common_mistake") return `What is the common mistake with: ${nc.title}?`;
    if (nc.type === "memory_hook" || nc.type === "visual_mnemonic") return `How do you remember: ${nc.title}?`;
    if (nc.type === "complication_risk") return `What are the complications of: ${nc.title}?`;
    if (nc.type === "formula_breakdown") return `Break down the formula: ${nc.title}`;
    return `${nc.title}`;
  };

  const cards: RecallCard[] = noteCards.map((nc, i) => ({
    id:          `teach-${nc.type}-${i}`,
    type:        cardTypeOf(nc.type),
    front:       frontOf(nc),
    back:        nc.body,
    tag:         nc.type,
    reviewCount: 0,
    isMissed:    false,
  }));

  const topic = opts.pageTitle || `Page ${opts.pageNumber}`;

  return {
    id:              stableRecallId(opts.bookId, opts.pageNumber, "teach-seq"),
    bookId:          opts.bookId,
    bookTitle:       opts.bookTitle,
    sourceLabel:     "teach-canvas",
    pageNumber:      opts.pageNumber,
    subject:         opts.subject ?? inferSubject(opts.bookId),
    topic,
    cards,
    createdAt:       Date.now(),
    knowledgeNodeId: opts.knowledgeNodeId ?? undefined,
  };
}

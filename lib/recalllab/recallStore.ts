// lib/recalllab/recallStore.ts
// localStorage-backed store for Recall Lab study sets and cards.

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

const STORAGE_KEY     = "recallSets_v1";
const STORAGE_IDB_KEY = "recallSets_in_idb";
const IDB_NAME        = "avrrio_recall_v1";
const IDB_STORE       = "sets";

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openRecallIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveSetsToIDB(sets: RecallSet[]): Promise<void> {
  const db = await openRecallIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(JSON.stringify(sets), "all");
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

async function loadSetsFromIDB(): Promise<RecallSet[]> {
  try {
    const db = await openRecallIDB();
    return new Promise((resolve) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get("all");
      req.onsuccess = () => {
        db.close();
        try { resolve(JSON.parse(req.result ?? "[]")); } catch { resolve([]); }
      };
      req.onerror = () => { db.close(); resolve([]); };
    });
  } catch { return []; }
}

// ── Compact card payloads before storage ──────────────────────────────────────

function compactSet(set: RecallSet): RecallSet {
  return {
    ...set,
    cards: set.cards
      .slice(0, 25)
      .map(c => ({
        ...c,
        front: c.front.slice(0, 200),
        back:  c.back.slice(0, 250),
        hint:  c.hint?.slice(0, 100),
      })),
  };
}

// ── Core load/save ────────────────────────────────────────────────────────────

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

async function saveAll(sets: RecallSet[]): Promise<void> {
  if (typeof window === "undefined") throw new Error("saveAll called outside browser");
  const compact    = sets.map(compactSet);
  const serialized = JSON.stringify(compact);
  console.log("[RECALLLAB_PAYLOAD_SIZE]", { count: compact.length, bytes: serialized.length, kb: Math.round(serialized.length / 1024) });
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.removeItem(STORAGE_IDB_KEY);
    window.dispatchEvent(new Event("recall-lab-updated"));
  } catch (lsErr) {
    console.error("[RECALLLAB_SAVE_LOCALSTORAGE_FAIL]", { bytes: serialized.length, error: String(lsErr) });
    try {
      await saveSetsToIDB(compact);
      localStorage.setItem(STORAGE_IDB_KEY, "1");
      console.log("[RECALLLAB_SAVE_INDEXEDDB_SUCCESS]", { count: compact.length });
      window.dispatchEvent(new Event("recall-lab-updated"));
    } catch (idbErr) {
      console.error("[RECALLLAB_SAVE_ERROR]", { stage: "indexedDB", error: String(idbErr) });
      throw lsErr;
    }
  }
}

export function getAllRecallSets(): RecallSet[] {
  return loadFromLS();
}

export async function getAllRecallSetsWithFallback(): Promise<RecallSet[]> {
  const ls = loadFromLS();
  if (ls.length > 0) return ls;
  if (typeof window !== "undefined" && localStorage.getItem(STORAGE_IDB_KEY) === "1") {
    return loadSetsFromIDB();
  }
  return [];
}

export function getRecallSetsByBook(bookId: string): RecallSet[] {
  return loadFromLS().filter((s) => s.bookId === bookId);
}

export async function saveRecallSet(set: RecallSet): Promise<void> {
  const sets = loadFromLS();
  const idx = sets.findIndex((s) => s.bookId === set.bookId && s.pageNumber === set.pageNumber);
  if (idx >= 0) {
    sets[idx] = set;
  } else {
    sets.unshift(set);
  }
  await saveAll(sets.slice(0, 300));
}

export async function deleteRecallSet(id: string): Promise<void> {
  await saveAll(loadFromLS().filter((s) => s.id !== id));
}

export async function updateCardDifficulty(setId: string, cardId: string, difficulty: CardDifficulty): Promise<void> {
  const sets = loadFromLS();
  const set = sets.find((s) => s.id === setId);
  if (!set) return;
  const card = set.cards.find((c) => c.id === cardId);
  if (!card) return;
  card.difficulty = difficulty;
  card.reviewCount = (card.reviewCount ?? 0) + 1;
  card.isMissed = difficulty === "hard";
  await saveAll(sets);
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

  const id = `rs-${bookId}-p${pageNumber}-${Date.now()}`;
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

  const id = `rs-${note.bookId}-p${note.pageNumber}-note-${Date.now()}`;
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

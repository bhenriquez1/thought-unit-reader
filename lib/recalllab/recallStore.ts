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

const STORAGE_KEY = "recallSets_v1";

const IDB_DB_NAME = "avrrio_recall_v1";
const IDB_STORE_NAME = "sets";
const IDB_FLAG_KEY = "recallSets_in_idb";

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

async function saveToIDB(sets: RecallSet[]): Promise<void> {
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

async function loadAllAsync(): Promise<RecallSet[]> {
  if (typeof window === "undefined") return [];
  // IDB-first: always try IndexedDB as primary store
  try {
    const idbSets = await loadFromIDB();
    if (idbSets.length > 0) {
      console.log("[RECALL_STORAGE_DRIVER]", { driver: "indexeddb", count: idbSets.length });
      return idbSets;
    }
  } catch (e) {
    console.warn("[RECALL_IDB_LOAD_FAIL]", String(e));
  }
  // IDB empty or unavailable — check localStorage for migration
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.log("[RECALL_STORAGE_DRIVER]", { driver: "empty" });
      return [];
    }
    const parsed = JSON.parse(raw);
    const lsSets = Array.isArray(parsed) ? parsed : [];
    if (lsSets.length > 0) {
      console.log("[RECALL_STORAGE_DRIVER]", { driver: "localstorage-migration", count: lsSets.length });
      // Silently migrate to IDB
      saveToIDB(lsSets)
        .then(() => { try { localStorage.setItem(IDB_FLAG_KEY, "1"); } catch {} })
        .catch(() => {});
    }
    return lsSets;
  } catch {
    return [];
  }
}

function loadAll(): RecallSet[] {
  if (typeof window === "undefined") return [];
  console.log("[RECALL_READ_KEY]", { key: STORAGE_KEY, idbFlagKey: IDB_FLAG_KEY });
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
  if (typeof window === "undefined") return;
  const compacted = sets.map(compact);
  const serialized = JSON.stringify(compacted);
  console.log("[RECALL_WRITE_KEY]", { key: STORAGE_KEY, idbFlagKey: IDB_FLAG_KEY });
  let toSave = serialized;
  if (serialized.length > 200000) {
    const trimmed = compacted.map(s => ({ ...s, cards: s.cards.slice(0, 15).map(c => ({ ...c, front: c.front.slice(0, 120), back: c.back.slice(0, 150) })) }));
    toSave = JSON.stringify(trimmed);
    console.warn("[RECALL_TRIM_OVERSIZED]", { originalBytes: serialized.length, trimmedBytes: toSave.length });
  }
  console.log("[RECALL_PAYLOAD_SIZE]", {
    writeKey:   STORAGE_KEY,
    bytes:      toSave.length,
    kb:         (toSave.length / 1024).toFixed(1),
    setCount:   compacted.length,
    cards0:     compacted[0]?.cards?.length ?? 0,
    willQuota:  toSave.length > 2_000_000,
  });
  console.log("[RECALL_SAVE_COMPACTED]", { key: STORAGE_KEY, setCount: compacted.length, bytes: toSave.length, kb: (toSave.length / 1024).toFixed(1), cards0: compacted[0]?.cards?.length ?? 0 });
  console.log("[RECALL_SAVE_KEY]", { key: STORAGE_KEY, count: compacted.length, bytes: toSave.length });
  // IDB-first: IndexedDB is the primary store — no localStorage quota risk
  try {
    await saveToIDB(compacted);
    try { localStorage.setItem(IDB_FLAG_KEY, "1"); } catch {}
    console.log("[RECALL_SAVE_SUCCESS]", { driver: "indexeddb", key: STORAGE_KEY, count: compacted.length });
    console.log("[RECALL_READ_AFTER_SAVE_SUCCESS]", { driver: "indexeddb", count: compacted.length });
    window.dispatchEvent(new Event("recall-lab-updated"));
  } catch (idbErr) {
    console.warn("[RECALL_IDB_FAIL]", String(idbErr), "→ fallback to localStorage");
    try {
      localStorage.setItem(STORAGE_KEY, toSave);
      try { localStorage.removeItem(IDB_FLAG_KEY); } catch {}
      console.log("[RECALL_SAVE_SUCCESS]", { driver: "localstorage-fallback", key: STORAGE_KEY, count: compacted.length });
      window.dispatchEvent(new Event("recall-lab-updated"));
    } catch (lsErr) {
      console.error("[RECALL_ALL_STORAGE_FAIL]", { idb: String(idbErr), ls: String(lsErr) });
      throw new Error(`Recall storage failed — IDB: ${String(idbErr)} / LS: ${String(lsErr)}`);
    }
  }
}

export function getAllRecallSets(): RecallSet[] {
  return loadAll();
}

export async function getAllRecallSetsAsync(): Promise<RecallSet[]> {
  return loadAllAsync();
}

export function getRecallSetsByBook(bookId: string): RecallSet[] {
  return loadAll().filter((s) => s.bookId === bookId);
}

export async function isRecallSetPersisted(id: string): Promise<boolean> {
  const inLS = loadAll().find((s) => s.id === id);
  if (inLS) return true;
  try {
    const sets = await loadFromIDB();
    return sets.some((s) => s.id === id);
  } catch {
    return false;
  }
}

export async function saveRecallSet(set: RecallSet): Promise<void> {
  const sets = await loadAllAsync();
  const idx = sets.findIndex((s) => s.bookId === set.bookId && s.pageNumber === set.pageNumber);
  if (idx >= 0) {
    sets[idx] = set;
  } else {
    sets.unshift(set);
  }
  await saveAll(sets.slice(0, 300));
  // Read-back verification — surface exact error if data didn't persist
  const saved = await loadAllAsync();
  const ok = saved.some(s => s.id === set.id);
  if (!ok) {
    const driver = localStorage.getItem(IDB_FLAG_KEY) === "1" ? "idb" : "ls";
    console.error("[RECALL_SAVE_VERIFY_FAIL]", { id: set.id, driver, savedCount: saved.length });
    throw new Error(`Recall set was written but could not be read back (driver=${driver}). Storage may be full or corrupt.`);
  }
  console.log("[RECALL_SAVE_VERIFIED]", { id: set.id, driver: localStorage.getItem(IDB_FLAG_KEY) === "1" ? "idb" : "ls", savedCount: saved.length });
}

export async function deleteRecallSet(id: string): Promise<void> {
  const sets = await loadAllAsync(); // IDB-first — loadAll() would wipe IDB data
  await saveAll(sets.filter((s) => s.id !== id));
  console.log("[RECALL_DELETE]", { id, remaining: sets.length - 1 });
}

export async function updateCardDifficulty(setId: string, cardId: string, difficulty: CardDifficulty): Promise<void> {
  const sets = await loadAllAsync(); // IDB-first — loadAll() would wipe IDB data
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

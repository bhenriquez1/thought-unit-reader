// lib/recalllab/recallStore.ts
// localStorage-backed store for Recall Lab study sets and cards.

import { type NoteSubject, type UltraNote, inferSubject } from "@/lib/notelab/ultraNoteStore";
import type { UltraPageView } from "@/lib/insights/buildUltraPageView";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";

export type CardType = "core" | "definition" | "rule" | "reason" | "trap" | "contrast" | "formula" | "memory" | "fill-blank";
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

function loadAll(): RecallSet[] {
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

function saveAll(sets: RecallSet[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
    // Notify RecallLab components listening for updates
    window.dispatchEvent(new Event("recall-lab-updated"));
  } catch {}
}

export function getAllRecallSets(): RecallSet[] {
  return loadAll();
}

export function getRecallSetsByBook(bookId: string): RecallSet[] {
  return loadAll().filter((s) => s.bookId === bookId);
}

export function saveRecallSet(set: RecallSet): void {
  const sets = loadAll();
  const idx = sets.findIndex((s) => s.bookId === set.bookId && s.pageNumber === set.pageNumber);
  if (idx >= 0) {
    sets[idx] = set;
  } else {
    sets.unshift(set);
  }
  saveAll(sets.slice(0, 300));
}

export function deleteRecallSet(id: string): void {
  saveAll(loadAll().filter((s) => s.id !== id));
}

export function updateCardDifficulty(setId: string, cardId: string, difficulty: CardDifficulty): void {
  const sets = loadAll();
  const set = sets.find((s) => s.id === setId);
  if (!set) return;
  const card = set.cards.find((c) => c.id === cardId);
  if (!card) return;
  card.difficulty = difficulty;
  card.reviewCount = (card.reviewCount ?? 0) + 1;
  card.isMissed = difficulty === "hard";
  saveAll(sets);
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

  // 5. Fill-in-blank and trap cards from OpenAI miniTestItems
  if (studyModel?.miniTestItems?.length) {
    for (const item of studyModel.miniTestItems) {
      if (item.type !== "fill-in-the-blank" && item.type !== "trap") continue;
      const cardType: CardType = item.type === "fill-in-the-blank" ? "fill-blank" : "trap";
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

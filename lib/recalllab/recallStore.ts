// lib/recalllab/recallStore.ts
// localStorage-backed store for Recall Lab study sets and cards.

import { type NoteSubject, type UltraNote, inferSubject } from "@/lib/notelab/ultraNoteStore";
import type { UltraPageView } from "@/lib/insights/buildUltraPageView";

export type CardType = "core" | "pattern" | "reason" | "rule" | "trap" | "formula" | "memory";
export type CardDifficulty = "easy" | "medium" | "hard";

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

export function buildRecallSetFromView(
  view: UltraPageView,
  bookId: string,
  pageNumber: number
): RecallSet {
  const topic = view.title.replace(/^ULTRA\s*[–—-]\s*/i, "").trim() || `Page ${pageNumber}`;
  const cards: RecallCard[] = [];
  let n = 0;

  if (view.coreIdea) {
    cards.push(card(`c${++n}`, "core", `What is the core idea of "${topic}"?`, view.coreIdea));
  }

  view.blocks.forEach((block, bi) => {
    const p = `b${bi + 1}`;
    if (block.pattern) {
      cards.push(card(`${p}-pat`, "pattern", `Pattern for: ${block.title}`, block.pattern));
    }
    if (block.surgicalReason) {
      cards.push(card(`${p}-why`, "reason", `Why does "${block.title}" work this way?`, block.surgicalReason, block.pattern || undefined));
    }
    if (block.rule) {
      cards.push(card(`${p}-rule`, "rule", `State the rule for: ${block.title}`, block.rule, block.surgicalReason || undefined));
    }
    if (block.trap) {
      cards.push(card(`${p}-trap`, "trap", `⚠️ What is the trap for: ${block.title}?`, block.trap));
    }
  });

  (view.compression ?? []).slice(0, 2).forEach((s, i) => {
    if (s) cards.push(card(`mem-${i}`, "memory", "Complete the memory shortcut:", s));
  });

  return {
    id: `rs-${bookId}-p${pageNumber}-${Date.now()}`,
    bookId,
    pageNumber,
    subject: inferSubject(bookId),
    topic,
    cards,
    createdAt: Date.now(),
  };
}

export function buildRecallSetFromNote(note: UltraNote): RecallSet {
  const cards: RecallCard[] = [];
  let n = 0;

  if (note.coreIdea) {
    cards.push(card(`c${++n}`, "core", `What is the core idea of "${note.topic}"?`, note.coreIdea));
  }

  note.concepts.forEach((c, ci) => {
    const p = `n${ci + 1}`;
    if (c.pattern) cards.push(card(`${p}-pat`, "pattern", `Pattern for: ${c.title}?`, c.pattern));
    if (c.surgicalReason) cards.push(card(`${p}-why`, "reason", `Why: ${c.title}?`, c.surgicalReason));
    if (c.rule) cards.push(card(`${p}-rule`, "rule", `Rule for: ${c.title}?`, c.rule, c.surgicalReason || undefined));
    if (c.trap) cards.push(card(`${p}-trap`, "trap", `⚠️ Trap for: ${c.title}?`, c.trap));
  });

  note.memoryShortcuts.forEach((s, i) => {
    cards.push(card(`mem-${i}`, "memory", "Complete the memory shortcut:", s));
  });

  return {
    id: `rs-${note.bookId}-p${note.pageNumber}-note-${Date.now()}`,
    bookId: note.bookId,
    pageNumber: note.pageNumber,
    subject: note.subject ?? "General Notes",
    topic: note.topic,
    cards,
    createdAt: Date.now(),
    sourceNoteId: note.id,
  };
}

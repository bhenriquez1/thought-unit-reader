// lib/apex/bookCatalogue.ts
// DAT subject catalogue: predefined book registry + user-upload merging.

import { getAllUltraNotes } from "@/lib/notelab/ultraNoteStore";
import type { TocItem } from "@/lib/stores/tocStore";
import type { DifficultyLevel } from "@/lib/examEngine/types";

export type DATSubject = "Biology" | "General Chemistry" | "Organic Chemistry" | "Other";

export const DAT_SUBJECTS: DATSubject[] = [
  "Biology",
  "General Chemistry",
  "Organic Chemistry",
  "Other",
];

export interface CatalogueBook {
  bookId: string;
  bookTitle: string;
  subject: DATSubject;
  noteCount: number;
}

/** Infer DAT subject from bookId/title keywords */
export function inferDATSubject(bookId: string, bookTitle?: string): DATSubject {
  const text = `${bookId} ${bookTitle ?? ""}`.toLowerCase();
  if (/organ(ic)?|orgo|klein|sn1|sn2|nucleophile|electrophile|carbocation/.test(text)) {
    return "Organic Chemistry";
  }
  if (
    /gen(eral)?\s*chem|gchem|zumdahl|stoich|molarity|enthalpy|chad.*chem|dat.*gc/.test(
      text,
    )
  ) {
    return "General Chemistry";
  }
  if (
    /bio(logy)?|anatomy|physiology|genetics|cell|organism|feralis|campbell|cliff.*bio/.test(
      text,
    )
  ) {
    return "Biology";
  }
  if (/chem/.test(text)) return "General Chemistry";
  return "Other";
}

/** Build a catalogue of books that have UltraNotes, inferring DAT subject. */
export function getUserBookCatalogue(): CatalogueBook[] {
  const notes = getAllUltraNotes();
  const countMap = new Map<string, { bookTitle: string; count: number }>();

  for (const note of notes) {
    const entry = countMap.get(note.bookId);
    if (entry) {
      entry.count += 1;
    } else {
      countMap.set(note.bookId, {
        bookTitle: note.bookTitle ?? note.bookId,
        count: 1,
      });
    }
  }

  const books: CatalogueBook[] = [];
  for (const [bookId, { bookTitle, count }] of countMap.entries()) {
    books.push({
      bookId,
      bookTitle,
      subject: inferDATSubject(bookId, bookTitle),
      noteCount: count,
    });
  }

  return books.sort((a, b) => b.noteCount - a.noteCount);
}

// ---------------------------------------------------------------------------
// Practice modes
// ---------------------------------------------------------------------------

export type PracticeMode = "practice" | "practice-exam" | "full-dat";

export interface PracticeModeConfig {
  id: PracticeMode;
  icon: string;
  label: string;
  description: string;
  questionRange: [number, number];
  timed: boolean;
  immediateReview: boolean;
  defaultQuestions: number;
  defaultTimeMinutes: number;
}

export const PRACTICE_MODES: PracticeModeConfig[] = [
  {
    id: "practice",
    icon: "📘",
    label: "Practice",
    description: "Untimed · instant feedback · learn as you go",
    questionRange: [5, 30],
    timed: false,
    immediateReview: true,
    defaultQuestions: 10,
    defaultTimeMinutes: 999,
  },
  {
    id: "practice-exam",
    icon: "📝",
    label: "Practice Exam",
    description: "Timed · feedback at the end · exam conditions",
    questionRange: [20, 60],
    timed: true,
    immediateReview: false,
    defaultQuestions: 40,
    defaultTimeMinutes: 90,
  },
  {
    id: "full-dat",
    icon: "🎯",
    label: "Full DAT Exam",
    description: "Complete Prometric simulation · all sections",
    questionRange: [60, 280],
    timed: true,
    immediateReview: false,
    defaultQuestions: 280,
    defaultTimeMinutes: 255,
  },
];

// ---------------------------------------------------------------------------
// Difficulty labels
// ---------------------------------------------------------------------------

export interface DifficultyOption {
  value: DifficultyLevel;
  emoji: string;
  label: string;
  blurb: string;
}

export const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  {
    value: "foundation",
    emoji: "🟢",
    label: "Foundation",
    blurb: "Core concepts, easy pacing",
  },
  {
    value: "simulation",
    emoji: "🟡",
    label: "Standard DAT",
    blurb: "Real-DAT pacing and style",
  },
  {
    value: "advanced",
    emoji: "🟠",
    label: "Advanced DAT",
    blurb: "Above average DAT difficulty",
  },
  {
    value: "mastery",
    emoji: "🔴",
    label: "Mastery",
    blurb: "Multi-concept, trap-heavy",
  },
];

// ---------------------------------------------------------------------------
// Chapter page-range helpers
// ---------------------------------------------------------------------------

/** Convert selected TocItem ids → {start, end} page ranges for examBuilder. */
export function tocToPageRanges(
  allItems: TocItem[],
  selectedIds: Set<string>,
): { start: number; end: number }[] {
  if (!selectedIds.size) return [];
  const sorted = [...allItems].sort((a, b) => a.pageNumber - b.pageNumber);
  return sorted
    .filter((item) => selectedIds.has(item.id))
    .map((item) => {
      const nextInAll = sorted.find((t) => t.pageNumber > item.pageNumber);
      return {
        start: item.pageNumber,
        end: nextInAll ? nextInAll.pageNumber - 1 : 999_999,
      };
    });
}

/** Given a page number, find the best-matching TocItem title. */
export function chapterForPage(
  pageNumber: number,
  allItems: TocItem[],
): string {
  const sorted = [...allItems]
    .filter((t) => t.level === 0 || allItems.filter((x) => x.level === 0).length === 0)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  let match = sorted[0];
  for (const item of sorted) {
    if (item.pageNumber <= pageNumber) match = item;
    else break;
  }
  return match?.title ?? `Page ${pageNumber}`;
}

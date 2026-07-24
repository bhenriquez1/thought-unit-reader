// lib/apex/bookCatalogue.ts
// DAT subject catalogue: predefined book registry + user-upload merging.

import { getAllUltraNotesAsync } from "@/lib/notelab/ultraNoteStore";
import type { TocItem } from "@/lib/stores/tocStore";
import type { DifficultyLevel } from "@/lib/examEngine/types";

export type DATSubject = "Biology" | "General Chemistry" | "Organic Chemistry" | "Other";

export const DAT_SUBJECTS: DATSubject[] = [
  "Biology",
  "General Chemistry",
  "Organic Chemistry",
  "Other",
];

export type SubjectConfidence = "high" | "low";

export interface ClassificationResult {
  subject: DATSubject;
  confidence: SubjectConfidence;
}

export interface CatalogueBook {
  bookId: string;
  bookTitle: string;
  subject: DATSubject;
  /** "high" = multiple strong keyword signals; "low" = single/generic match */
  subjectConfidence: SubjectConfidence;
  noteCount: number;
}

const SUBJECT_OVERRIDE_KEY = (bookId: string) => `avrrio:v1:subject-override:${bookId}`;

/** Persist a user-chosen subject override for a book. */
export function setSubjectOverride(bookId: string, subject: DATSubject | null): void {
  if (typeof window === "undefined") return;
  const key = SUBJECT_OVERRIDE_KEY(bookId);
  try {
    if (subject === null) localStorage.removeItem(key);
    else localStorage.setItem(key, subject);
  } catch { /* quota */ }
}

/** Read back a persisted override, or null if none. */
export function getSubjectOverride(bookId: string): DATSubject | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(SUBJECT_OVERRIDE_KEY(bookId));
    return (DAT_SUBJECTS as string[]).includes(v ?? "") ? (v as DATSubject) : null;
  } catch { return null; }
}

/** Classify a book by title/id keywords, returning subject + confidence.
 *  Confidence is "high" when multiple specific signals match;
 *  "low" when only a generic term (e.g. "chem") or nothing matched. */
export function classifyBook(bookId: string, bookTitle?: string): ClassificationResult {
  const text = `${bookId} ${bookTitle ?? ""}`.toLowerCase();

  const orgHigh = /organ(ic)?|orgo|klein|sn1|sn2|nucleophile|electrophile|carbocation/.test(text);
  const gcHigh  = /gen(eral)?\s*chem|gchem|zumdahl|stoich|molarity|enthalpy|chad.*chem|dat.*gc/.test(text);
  const bioHigh = /bio(logy)?|anatomy|physiology|genetics|cell|organism|feralis|campbell|cliff.*bio/.test(text);
  const gcLow   = /chem/.test(text);

  if (orgHigh) return { subject: "Organic Chemistry", confidence: "high" };
  if (gcHigh)  return { subject: "General Chemistry", confidence: "high" };
  if (bioHigh) return { subject: "Biology",           confidence: "high" };
  if (gcLow)   return { subject: "General Chemistry", confidence: "low"  };
  return         { subject: "Other",                  confidence: "low"  };
}

/** Convenience wrapper kept for internal use. */
function inferDATSubject(bookId: string, bookTitle?: string): DATSubject {
  return classifyBook(bookId, bookTitle).subject;
}

/** Build a catalogue of books that have UltraNotes, inferring DAT subject.
 *  Reads from IndexedDB (authoritative) instead of the stale LS mirror. */
export async function getUserBookCatalogue(): Promise<CatalogueBook[]> {
  const notes = await getAllUltraNotesAsync();
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
    const override = getSubjectOverride(bookId);
    const { subject: detected, confidence } = classifyBook(bookId, bookTitle);
    books.push({
      bookId,
      bookTitle,
      subject: override ?? detected,
      subjectConfidence: override ? "high" : confidence,
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

// ---------------------------------------------------------------------------
// Chapter-range validation
// ---------------------------------------------------------------------------

export interface PageRange {
  start: number;
  end: number;
}

/**
 * Validate and normalise chapter page ranges before passing them to buildExam.
 * - Clamps start to ≥ 1
 * - Ensures end ≥ start (swaps reversed pairs)
 * - Optionally clamps to totalPages
 * - Merges overlapping ranges
 * Returns a sorted, non-overlapping array (empty if input is empty or invalid).
 */
export function normalizePageRanges(
  ranges: PageRange[],
  totalPages?: number,
): PageRange[] {
  if (!ranges.length) return [];

  const valid: PageRange[] = ranges
    .map((r) => ({
      start: Math.max(1, Math.min(r.start, r.end)),
      end:   Math.max(1, Math.max(r.start, r.end)),
    }))
    .filter((r) => r.start >= 1 && r.end >= r.start)
    .map((r) => ({
      start: r.start,
      end:   totalPages ? Math.min(r.end, totalPages) : r.end,
    }))
    .filter((r) => r.start <= r.end);

  if (!valid.length) return [];

  // Merge overlapping / adjacent ranges
  valid.sort((a, b) => a.start - b.start);
  const merged: PageRange[] = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i++) {
    const last = merged[merged.length - 1];
    if (valid[i].start <= last.end + 1) {
      last.end = Math.max(last.end, valid[i].end);
    } else {
      merged.push({ ...valid[i] });
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Source-sufficiency guard
// ---------------------------------------------------------------------------

export interface SourceSufficiency {
  /** Number of notes actually available for the current selection. */
  availableNotes: number;
  /**
   * Recommended upper bound on question count given the available notes.
   * Based on 3 distinct questions per note as a practical ceiling.
   */
  recommendedMax: number;
  /** True when questionCount ≤ recommendedMax. */
  sufficient: boolean;
  /** Human-readable warning message, or null when sufficient. */
  warning: string | null;
}

/**
 * Check whether enough source notes exist for the requested question count.
 * @param availableNotes Number of UltraNotes in the selected chapters/book.
 * @param requestedQuestions How many questions the user wants to generate.
 */
export function computeSourceSufficiency(
  availableNotes: number,
  requestedQuestions: number,
): SourceSufficiency {
  const recommendedMax = Math.max(availableNotes * 3, 5);
  const sufficient = requestedQuestions <= recommendedMax;
  const warning = sufficient
    ? null
    : `Only ${availableNotes} note${availableNotes === 1 ? "" : "s"} available in the selected source. ` +
      `Expect repetitive questions above ${recommendedMax}. ` +
      `Either select more chapters or reduce the question count.`;
  return { availableNotes, recommendedMax, sufficient, warning };
}

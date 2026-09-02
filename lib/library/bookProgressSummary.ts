// lib/library/bookProgressSummary.ts
// L7 (Learning Hub orchestration correction, Section 8) — "Every saved book
// should show meaningful progress (percent read, concepts encountered, due
// Recall, weak concepts)." The Library drawer (pages/index.tsx's "My
// Library" panel) previously showed nothing but a filename and a delete
// button. This computes a per-book summary from data already keyed by
// bookId (reading position, notes, and — via the same canonical
// KnowledgeNodeProgress infra chapterProgress.ts/KnowledgeStatePanel
// already use — concepts encountered/due-for-recall/weak-concept counts)
// without requiring that book's PDF to be open.
//
// Deliberately NOT the full chapter-level Read/Understand/Recall/Mastery %
// the Course Dashboard shows for the currently-open book — that requires
// the book's syllabus TOC, which today only ever exists in memory after
// parsing that book's own PDF outline, so computing it for every OTHER
// saved book would mean silently loading and parsing PDFs the student
// hasn't opened. That's a real, separate follow-up (persisting each book's
// TOC once computed), not something to fake here.

import { getReadingProgress } from "@/lib/reader/readingProgressStore";
import { getNotesByBookAsync } from "@/lib/notelab/ultraNoteStore";
import { getNodesByBook, getProgressForNodes } from "@/lib/knowledge/knowledgeGraphStore";
import { selectDueForRecall } from "@/lib/learningHub/knowledgeStateSelectors";
import { selectWeakNodes } from "@/lib/examEngine/examScope";

export interface BookProgressSummary {
  /** Furthest page reached, from lib/reader/readingProgressStore.ts — the
   *  live "how far read" signal (unlike the Firestore library doc's own
   *  readingProgress/lastOpenedPage fields, which are written once at
   *  upload time and never updated again). Null if the book has never been
   *  opened on this device. */
  furthestPageReached: number | null;
  notesCount: number;
  conceptsEncountered: number;
  dueForRecallCount: number;
  weakConceptsCount: number;
}

const EMPTY_SUMMARY: BookProgressSummary = {
  furthestPageReached: null,
  notesCount: 0,
  conceptsEncountered: 0,
  dueForRecallCount: 0,
  weakConceptsCount: 0,
};

export async function computeBookProgressSummary(bookId: string): Promise<BookProgressSummary> {
  if (!bookId) return EMPTY_SUMMARY;

  const [readingProgress, notes, nodes] = await Promise.all([
    getReadingProgress(bookId).catch(() => null),
    getNotesByBookAsync(bookId).catch(() => []),
    getNodesByBook(bookId).catch(() => []),
  ]);

  const progressByNodeId = nodes.length > 0
    ? await getProgressForNodes(nodes.map((n) => n.id)).catch(() => new Map())
    : new Map();

  const dueForRecallCount = selectDueForRecall({ nodes, progressByNodeId, maxItems: nodes.length }).length;
  const weakConceptsCount = selectWeakNodes({ nodes, progressByNodeId, weakAccuracyThreshold: 60, minAttemptsForSignal: 3 }).length;

  return {
    furthestPageReached: readingProgress?.furthestPageReached ?? null,
    notesCount: notes.length,
    conceptsEncountered: nodes.length,
    dueForRecallCount,
    weakConceptsCount,
  };
}

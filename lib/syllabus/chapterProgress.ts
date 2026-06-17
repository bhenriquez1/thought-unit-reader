// lib/syllabus/chapterProgress.ts
//
// Chapter-level progress aggregation. RecallLab cards, NoteLab notes, and
// StudyGuide records are all currently keyed by page (or, for StudyGuides, by
// a free-text chapter title) — none of them know about "chapters" as a unit.
// This module rolls those per-page/per-title signals up into one progress
// reading per Syllabus topic ("chapter"): Read / Understand / Recall / Mastery
// %, a status label, and cross-link counts.
//
// This is the data layer Study Plan Lab's chapter/unit/exam-prep plans read
// from — without it, those plans would have nothing real to plan against.

import type { SyllabusTopic } from "@/lib/stores/syllabusStore";
import type { RecallSet, RecallCard } from "@/lib/recalllab/recallStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";

export type ChapterStatus =
  | "not_started"
  | "reading"
  | "reviewing"
  | "mastered"
  | "needs_review"
  | "weak_area";

export interface ChapterProgress {
  topicId: string;
  title: string;
  pageCount: number;
  visitedPageCount: number;
  readPct: number;
  understandPct: number;
  recallPct: number;
  masteryPct: number;
  status: ChapterStatus;
  recallCardCount: number;
  recallReviewedCount: number;
  noteCount: number;
  studyGuideCount: number;
}

export interface ChapterProgressInputs {
  visitedPages: Set<number>;
  recallSets: RecallSet[];
  notes: UltraNote[];
  studyGuides: StudyGuideRecord[];
}

function pagesInRanges(ranges: Array<{ start: number; end: number }>): number[] {
  const pages: number[] = [];
  for (const r of ranges) {
    for (let p = r.start; p <= r.end; p += 1) pages.push(p);
  }
  return pages;
}

function pageInRanges(page: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((r) => page >= r.start && page <= r.end);
}

// Per-card recall confidence: an unreviewed card contributes 0 (not yet
// attempted at all). A reviewed card scores by its most recent difficulty
// rating, so repeated "hard" ratings keep recallPct honest instead of
// crediting a card just for having been looked at once.
function cardScore(c: RecallCard): number {
  if (c.reviewCount === 0) return 0;
  if (c.difficulty === "easy") return 100;
  if (c.difficulty === "medium") return 60;
  if (c.difficulty === "hard") return 25;
  return c.isMissed ? 25 : 70;
}

// StudyGuideRecord has no page range, only a free-text chapterTitle — match it
// to a Syllabus topic by loose substring containment in either direction.
function normalizedTitleMatch(chapterTitle: string, topicTitle: string): boolean {
  const a = chapterTitle.toLowerCase().trim();
  const b = topicTitle.toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function computeChapterProgress(
  topic: SyllabusTopic,
  inputs: ChapterProgressInputs
): ChapterProgress {
  const pages = pagesInRanges(topic.pageRanges);
  const pageCount = pages.length || 1; // guard against a malformed/empty range
  const visitedPageCount = pages.filter((p) => inputs.visitedPages.has(p)).length;
  const readPct = Math.round((visitedPageCount / pageCount) * 100);

  const notesInChapter = inputs.notes.filter((n) => pageInRanges(n.pageNumber, topic.pageRanges));
  const notedPages = new Set(notesInChapter.map((n) => n.pageNumber));
  const understandPct = visitedPageCount > 0
    ? Math.min(100, Math.round((notedPages.size / visitedPageCount) * 100))
    : 0;

  const recallSetsInChapter = inputs.recallSets.filter((s) => pageInRanges(s.pageNumber, topic.pageRanges));
  const cards = recallSetsInChapter.flatMap((s) => s.cards);
  const recallCardCount = cards.length;
  const recallReviewedCount = cards.filter((c) => c.reviewCount > 0).length;
  const recallPct = recallCardCount > 0
    ? Math.round(cards.reduce((sum, c) => sum + cardScore(c), 0) / recallCardCount)
    : 0;

  // Weighted toward recall — reading and understanding a chapter doesn't mean
  // much for exam readiness if nothing has stuck on review.
  const masteryPct = Math.round(readPct * 0.2 + understandPct * 0.3 + recallPct * 0.5);

  const studyGuideCount = inputs.studyGuides.filter((g) => normalizedTitleMatch(g.chapterTitle, topic.title)).length;

  let status: ChapterStatus;
  if (readPct === 0) {
    status = "not_started";
  } else if (masteryPct >= 80) {
    status = "mastered";
  } else if (readPct === 100 && masteryPct < 40) {
    status = "weak_area";
  } else if (recallCardCount > 0 && recallPct < 60) {
    status = "needs_review";
  } else if (readPct < 100) {
    status = "reading";
  } else {
    status = "reviewing";
  }

  return {
    topicId: topic.id,
    title: topic.title,
    pageCount,
    visitedPageCount,
    readPct,
    understandPct,
    recallPct,
    masteryPct,
    status,
    recallCardCount,
    recallReviewedCount,
    noteCount: notesInChapter.length,
    studyGuideCount,
  };
}

export interface CourseProgress {
  totalChapters: number;
  completedChapters: number;
  currentChapterId: string | null;
  remainingChapters: number;
  estimatedRemainingMinutes: number;
  overallReadPct: number;
  overallUnderstandPct: number;
  overallRecallPct: number;
  overallMasteryPct: number;
}

// Minutes-per-page estimate for "remaining study time" — a deliberately simple
// constant rather than a learned model. Study Plan Lab can refine this later
// once real per-session duration data exists; there's none today.
const MINUTES_PER_UNREAD_PAGE = 4;
const MINUTES_PER_UNMASTERED_PAGE_REVIEW = 2;

export function computeCourseProgress(
  topics: SyllabusTopic[],
  progressList: ChapterProgress[]
): CourseProgress {
  const totalChapters = topics.length;
  const completedChapters = progressList.filter((p) => p.status === "mastered").length;
  const current =
    progressList.find((p) => p.status !== "mastered" && p.status !== "not_started") ??
    progressList.find((p) => p.status === "not_started");
  const remainingChapters = totalChapters - completedChapters;

  let estimatedRemainingMinutes = 0;
  for (const p of progressList) {
    const unreadPages = Math.round(p.pageCount * (1 - p.readPct / 100));
    const unmasteredPages = Math.round(p.pageCount * (1 - p.masteryPct / 100));
    estimatedRemainingMinutes +=
      unreadPages * MINUTES_PER_UNREAD_PAGE + unmasteredPages * MINUTES_PER_UNMASTERED_PAGE_REVIEW;
  }

  const avg = (key: "readPct" | "understandPct" | "recallPct" | "masteryPct") =>
    progressList.length
      ? Math.round(progressList.reduce((sum, p) => sum + p[key], 0) / progressList.length)
      : 0;

  return {
    totalChapters,
    completedChapters,
    currentChapterId: current?.topicId ?? null,
    remainingChapters,
    estimatedRemainingMinutes,
    overallReadPct: avg("readPct"),
    overallUnderstandPct: avg("understandPct"),
    overallRecallPct: avg("recallPct"),
    overallMasteryPct: avg("masteryPct"),
  };
}

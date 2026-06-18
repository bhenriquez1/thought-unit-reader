// lib/syllabus/chapterProgress.ts
//
// Chapter-level progress aggregation. RecallLab cards, NoteLab notes, and
// StudyGuide records are all currently keyed by page (or, for StudyGuides, by
// a free-text chapter title) — none of them know about "chapters" as a unit.
// This module rolls those per-page/per-title signals up into one progress
// reading per chapter: Read / Understand / Recall / Mastery %, a status
// label, and cross-link counts.
//
// Chapters themselves come from the live Syllabus tab's `TocNode[]` tree
// (pages/index.tsx's `syllabusToc`), via `buildChaptersFromToc` below — not
// from `lib/stores/syllabusStore.ts`'s `SyllabusTopic`, which is a separate,
// unrendered model that nothing in the app currently populates.
//
// This is the data layer Study Plan Lab's chapter/unit/exam-prep plans read
// from — without it, those plans would have nothing real to plan against.

import type { TocNode } from "@/lib/readerContracts";
import type { RecallSet, RecallCard } from "@/lib/recalllab/recallStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import type { SavedHighlight } from "@/lib/highlights/savedHighlightsStore";

// Minimal shape `computeChapterProgress` needs from a "chapter" — satisfied
// both by `SyllabusTopic` (structurally) and by the chapters this module
// derives from the live `TocNode[]` tree via `buildChaptersFromToc`.
export interface ChapterLike {
  id: string;
  title: string;
  pageRanges: Array<{ start: number; end: number }>;
}

// Derives chapter-level page ranges from the live Syllabus tab's TocNode
// tree: each top-level "chapter" node's range runs from its own page up to
// (but not including) the next chapter's page, with the last chapter running
// to `totalPages`. Falls back to treating every top-level node as a chapter
// when none are explicitly tagged "chapter" (e.g. syllabus-only TOCs).
export function buildChaptersFromToc(toc: TocNode[], totalPages: number): ChapterLike[] {
  const tagged = toc.filter((n) => n.kind === "chapter");
  const topLevel = tagged.length > 0 ? tagged : toc;
  const sorted = [...topLevel].sort((a, b) => a.page - b.page);

  return sorted.map((node, idx) => {
    const nextPage = sorted[idx + 1]?.page;
    const end = nextPage !== undefined ? Math.max(node.page, nextPage - 1) : Math.max(node.page, totalPages);
    return {
      id: node.id,
      title: node.title,
      pageRanges: [{ start: node.page, end }],
    };
  });
}

export type ChapterStatus =
  | "not_started"
  | "reading"
  | "reviewing"
  | "mastered"
  | "needs_review"
  | "weak_area";

// One RightPanel-concept-level "thought unit" rolled up into the chapter
// tree — sourced from lib/highlights/savedHighlightsStore.ts, the only place
// individual VisualAnchors (not just pages) are persisted across the book.
export interface ChapterThoughtUnit {
  id: string;
  page: number;
  text: string;
  anchorType: string; // VisualAnchorRole, e.g. "coreIdea"
}

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
  thoughtUnitCount: number;
  thoughtUnits: ChapterThoughtUnit[];
  weakTopics: string[];
}

export interface ChapterProgressInputs {
  visitedPages: Set<number>;
  recallSets: RecallSet[];
  notes: UltraNote[];
  studyGuides: StudyGuideRecord[];
  savedHighlights?: SavedHighlight[];
}

export function pagesInRanges(ranges: Array<{ start: number; end: number }>): number[] {
  const pages: number[] = [];
  for (const r of ranges) {
    for (let p = r.start; p <= r.end; p += 1) pages.push(p);
  }
  return pages;
}

export function pageInRanges(page: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((r) => page >= r.start && page <= r.end);
}

// Cap on how many saved-highlight thought units the Syllabus tree renders
// per chapter — a chapter can accumulate far more than is useful to list.
const THOUGHT_UNIT_TREE_CAP = 30;

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
  topic: ChapterLike,
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

  const highlightsInChapter = (inputs.savedHighlights ?? []).filter((h) => pageInRanges(h.page, topic.pageRanges));
  const thoughtUnits: ChapterThoughtUnit[] = highlightsInChapter
    .slice(0, THOUGHT_UNIT_TREE_CAP)
    .map((h) => ({ id: h.id, page: h.page, text: h.text, anchorType: h.anchorType }));

  // Weak topics: cards that have been reviewed at least once and scored
  // poorly, labeled with the card's tag (concept title) when present,
  // otherwise a trimmed front-of-card snippet. Deduped, capped at 5.
  const weakTopics: string[] = [];
  const seenWeak = new Set<string>();
  for (const c of cards) {
    if (c.reviewCount === 0) continue;
    if (c.difficulty !== "hard" && !c.isMissed) continue;
    const label = (c.tag || c.front).trim().slice(0, 60);
    if (!label || seenWeak.has(label)) continue;
    seenWeak.add(label);
    weakTopics.push(label);
    if (weakTopics.length >= 5) break;
  }

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
    thoughtUnitCount: highlightsInChapter.length,
    thoughtUnits,
    weakTopics,
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
  topics: ChapterLike[],
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

// Course-level "what am I weak on?" — pools every chapter's weakTopics,
// ranks chapters with lower masteryPct first (their weak topics matter
// more), and dedupes so the same concept name surfacing in two chapters
// only appears once. This is what the Syllabus tab's "Weak Areas" line and
// Study Plan Lab's "Weakness Report" both read from.
export function computeWeakAreas(progressList: ChapterProgress[], limit = 5): string[] {
  const ranked = [...progressList].sort((a, b) => a.masteryPct - b.masteryPct);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of ranked) {
    for (const topic of p.weakTopics) {
      const key = topic.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(topic);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// Prerequisite Chain — the order a learner should move through chapters in.
// Chapters are already sorted by page in buildChaptersFromToc, and a book's
// page order *is* its authored teaching order, so the chain is just that
// order made explicit. (A future version could reorder around detected
// dependencies — e.g. promote a referenced-but-unread earlier chapter — but
// page order is a correct default, not a placeholder.)
export function buildPrerequisiteChain(chapters: ChapterLike[]): string[] {
  return chapters.map((c) => c.title);
}

export interface NextTopicRecommendation {
  chapterId: string;
  chapterTitle: string;
  page: number;
  reason: string;
}

// Answers "what should I study next?" for the Syllabus tab and Study Plan
// Lab banner — grounded in the same chapter-progress data everything else
// reads from, not a separate guess. Picks the course's current chapter
// (computeCourseProgress's rule: first non-mastered, non-untouched chapter,
// else the first untouched one), then within it: the next unread page, else
// the page behind the weakest-scoring recall card, else just the chapter's
// first page as a recall checkup.
export function computeNextTopicRecommendation(
  chapters: ChapterLike[],
  progressList: ChapterProgress[],
  visitedPages: Set<number>,
  recallSets: RecallSet[]
): NextTopicRecommendation | null {
  const course = computeCourseProgress(chapters, progressList);
  if (!course.currentChapterId) return null;

  const chapter = chapters.find((c) => c.id === course.currentChapterId);
  if (!chapter) return null;

  const pages = pagesInRanges(chapter.pageRanges);
  const unvisited = pages.filter((p) => !visitedPages.has(p));
  if (unvisited.length > 0) {
    return {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      page: unvisited[0],
      reason: `Continue reading — ${unvisited.length} unread page${unvisited.length === 1 ? "" : "s"} left in this chapter`,
    };
  }

  const recallSetsInChapter = recallSets.filter((s) => pageInRanges(s.pageNumber, chapter.pageRanges));
  for (const set of recallSetsInChapter) {
    const weakCard = set.cards.find((c) => c.reviewCount === 0 || c.isMissed || c.difficulty === "hard");
    if (weakCard) {
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        page: set.pageNumber,
        reason: weakCard.reviewCount === 0
          ? `Review unreviewed recall card: "${(weakCard.tag || weakCard.front).slice(0, 60)}"`
          : `Re-review weak recall card: "${(weakCard.tag || weakCard.front).slice(0, 60)}"`,
      };
    }
  }

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    page: pages[0] ?? 1,
    reason: `Run a quick recall check on ${chapter.title}`,
  };
}

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
//
// L2 (Learning Hub orchestration correction) — "Do NOT let every module
// invent its own mastery number... create/reuse one canonical concept-level
// Learning State." understandPct/recallPct/masteryPct/weakTopics used to be
// computed independently here, straight from raw RecallCard/UltraNote
// records — a second, disconnected mastery model sitting alongside
// lib/knowledge/knowledgeGraphSchema.ts's KnowledgeNodeProgress (the same
// store TestLab/Recall/Whiteboard already read/write through, keyed by
// KnowledgeNode.id). They're now rollups OVER that canonical per-node state,
// scoped to whichever nodes' sourcePages fall in a chapter's own page
// ranges — never a second, independently-computed number.
//
// readPct stays page-visit-based, deliberately NOT switched to a node
// signal: "encountered/exposed" (a page being visited) and "the learner's
// state on the concepts in it" are legitimately different signals — see the
// correction's own section 1 ("Do not equate 'page opened' with
// 'mastered'"). recallCardCount/recallReviewedCount/noteCount/
// studyGuideCount/thoughtUnits are still raw cross-link counts (how many of
// each artifact exist in this chapter) — a different, complementary
// question from "how well does the learner know this material," which is
// what the *Pct fields and weakTopics answer.

import type { TocNode } from "@/lib/readerContracts";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import type { SavedHighlight } from "@/lib/highlights/savedHighlightsStore";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";
import { selectWeakNodes } from "@/lib/examEngine/examScope";

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
  /** Canonical per-concept learning state — see this file's own header
   *  comment. Every KnowledgeNode for the active book/document, and its
   *  matching progress record when one exists (a node with no entry here
   *  has never been engaged at all — treated as 0 across the board, not
   *  excluded, same as the pre-L2 formula treated an unreviewed recall
   *  card as a 0 that still counted toward the average). Optional — a
   *  caller that hasn't loaded Knowledge Graph data (or genuinely has none
   *  yet) simply gets 0% understand/recall/mastery, the same "no signal
   *  yet" reading an empty node set already produces; Study Plan Lab's own
   *  tests build plans on top of ChapterProgress without needing to
   *  fabricate KG fixtures for a dimension they don't exercise. */
  nodes?: KnowledgeNode[];
  progressByNodeId?: Map<string, KnowledgeNodeProgress>;
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

// Same "weak" definition TestLab's own weak-area exam scope uses
// (lib/examEngine/examScope.ts's own default) — a concept flagged weak in
// the Syllabus tree means the same thing it means in TestLab, not a
// second, independently-tuned threshold.
const WEAK_ACCURACY_THRESHOLD = 60;
const MIN_ATTEMPTS_FOR_SIGNAL = 3;

function nodesInChapter(nodes: KnowledgeNode[], ranges: Array<{ start: number; end: number }>): KnowledgeNode[] {
  return nodes.filter((n) => n.sourcePages.some((p) => pageInRanges(p, ranges)));
}

// Averages a KnowledgeNodeProgress field across every node in the chapter —
// a node with no progress record yet contributes 0 to the sum but still
// counts in the denominator, the exact same "unreviewed counts as 0, but
// still counts" rule the pre-L2 card-based formula used. An empty node set
// (no KnowledgeNodes resolved for this chapter yet) reads as 0%, not NaN —
// "no signal yet," same as the old "no cards yet" case.
function averageProgressScore(
  nodes: KnowledgeNode[],
  progressByNodeId: Map<string, KnowledgeNodeProgress>,
  field: "understandingScore" | "recallScore",
): number {
  if (nodes.length === 0) return 0;
  const total = nodes.reduce((sum, n) => sum + (progressByNodeId.get(n.id)?.[field] ?? 0), 0);
  return Math.round(total / nodes.length);
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
  const kgNodes = inputs.nodes ?? [];
  const kgProgressByNodeId = inputs.progressByNodeId ?? new Map<string, KnowledgeNodeProgress>();
  const pages = pagesInRanges(topic.pageRanges);
  const pageCount = pages.length || 1; // guard against a malformed/empty range
  const visitedPageCount = pages.filter((p) => inputs.visitedPages.has(p)).length;
  const readPct = Math.round((visitedPageCount / pageCount) * 100);

  // Cross-link counts — how many of each artifact exist in this chapter, a
  // different question from "how well does the learner know it" (below).
  const notesInChapter = inputs.notes.filter((n) => pageInRanges(n.pageNumber, topic.pageRanges));
  const recallSetsInChapter = inputs.recallSets.filter((s) => pageInRanges(s.pageNumber, topic.pageRanges));
  const cards = recallSetsInChapter.flatMap((s) => s.cards);
  const recallCardCount = cards.length;
  const recallReviewedCount = cards.filter((c) => c.reviewCount > 0).length;

  // understandPct/recallPct — rollups over the canonical KnowledgeNodeProgress
  // for every node whose sourcePages fall in this chapter, not a second,
  // independently-computed number. See this file's own header comment.
  const chapterNodes = nodesInChapter(kgNodes, topic.pageRanges);
  const understandPct = averageProgressScore(chapterNodes, kgProgressByNodeId, "understandingScore");
  const recallPct = averageProgressScore(chapterNodes, kgProgressByNodeId, "recallScore");

  // Weighted toward recall — reading and understanding a chapter doesn't mean
  // much for exam readiness if nothing has stuck on review.
  const masteryPct = Math.round(readPct * 0.2 + understandPct * 0.3 + recallPct * 0.5);

  const studyGuideCount = inputs.studyGuides.filter((g) => normalizedTitleMatch(g.chapterTitle, topic.title)).length;

  const highlightsInChapter = (inputs.savedHighlights ?? []).filter((h) => pageInRanges(h.page, topic.pageRanges));
  const thoughtUnits: ChapterThoughtUnit[] = highlightsInChapter
    .slice(0, THOUGHT_UNIT_TREE_CAP)
    .map((h) => ({ id: h.id, page: h.page, text: h.text, anchorType: h.anchorType }));

  // Weak topics — the same selectWeakNodes() gate TestLab's own weak-area
  // exam scope uses (enough graded attempts to be meaningful, recallScore
  // below the shared threshold), scoped to this chapter's own nodes and
  // labeled by the node's real title — never a second, chapter-local
  // definition of "weak." Deduped by construction (one entry per node),
  // capped at 5.
  const weakTopics = selectWeakNodes({
    nodes: chapterNodes,
    progressByNodeId: kgProgressByNodeId,
    weakAccuracyThreshold: WEAK_ACCURACY_THRESHOLD,
    minAttemptsForSignal: MIN_ATTEMPTS_FOR_SIGNAL,
  }).slice(0, 5).map((n) => n.title);

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

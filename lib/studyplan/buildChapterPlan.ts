// lib/studyplan/buildChapterPlan.ts
// Turns a chapter's live Read/Understand/Recall/Mastery % (from
// lib/syllabus/chapterProgress.ts) directly into a study plan block — no
// diagnostic quiz required. This is what lets Study Plan Lab say "here is
// what to do next for the chapter you're currently on."

import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import { pageInRanges, pagesInRanges, type ChapterLike, type ChapterProgress } from "@/lib/syllabus/chapterProgress";
import type { ChapterStudyPlan, StudyPlanAction, StudyPlanBlock } from "./types";

export interface ChapterPlanInputs {
  visitedPages: Set<number>;
  notes: UltraNote[];
  recallSets: RecallSet[];
  studyGuides: StudyGuideRecord[];
}

function normalizedTitleMatch(a: string, b: string): boolean {
  const an = (a || "").toLowerCase().trim();
  const bn = (b || "").toLowerCase().trim();
  if (!an || !bn) return false;
  return an === bn || an.includes(bn) || bn.includes(an);
}

/** One chapter's gaps (unread pages, unreviewed/missed recall cards, matching
 *  notes/study guide) turned into a single actionable block. Shared by both
 *  the single-chapter plan below and the multi-chapter Unit Plan. */
export function buildChapterBlock(
  chapter: ChapterLike,
  progress: ChapterProgress,
  inputs: ChapterPlanInputs
): StudyPlanBlock {
  const pages = pagesInRanges(chapter.pageRanges);
  const unvisited = pages.filter((p) => !inputs.visitedPages.has(p));

  const notesInChapter = inputs.notes.filter((n) => pageInRanges(n.pageNumber, chapter.pageRanges));
  const recallSetsInChapter = inputs.recallSets.filter((s) => pageInRanges(s.pageNumber, chapter.pageRanges));
  const weakCards = recallSetsInChapter.flatMap((s) => s.cards).filter((c) => c.reviewCount === 0 || c.isMissed);
  const guide = inputs.studyGuides.find((g) => normalizedTitleMatch(g.chapterTitle, chapter.title));

  const actions: StudyPlanAction[] = [];

  if (unvisited.length > 0) {
    actions.push({
      type: "read_page",
      label: `Read page ${unvisited[0]} (${unvisited.length} unread page${unvisited.length === 1 ? "" : "s"} left in this chapter)`,
      page: unvisited[0],
    });
  }

  for (const note of notesInChapter.slice(0, 3)) {
    actions.push({
      type: "review_note",
      label: `Review NoteLab notes: "${note.topic}"`,
      page: note.pageNumber,
      refId: note.id,
    });
  }

  for (const set of recallSetsInChapter) {
    const weakInSet = set.cards.filter((c) => c.reviewCount === 0 || c.isMissed).length;
    if (weakInSet === 0) continue;
    actions.push({
      type: "review_recall",
      label: `Drill RecallLab set "${set.topic}" (${weakInSet} card${weakInSet === 1 ? "" : "s"} need review)`,
      page: set.pageNumber,
      refId: set.id,
    });
  }

  if (guide) {
    actions.push({
      type: "review_guide",
      label: `Read Study Guide: "${guide.topic || guide.chapterTitle}"`,
      refId: guide.id,
    });
  }

  actions.push({
    type: "practice",
    label: `Take a quick recall check on ${chapter.title}`,
  });

  return {
    id: `cpb-${chapter.id}`,
    title: chapter.title,
    topic: chapter.title,
    pages,
    actions,
    estimatedMinutes: 15 + unvisited.length * 4 + weakCards.length * 2,
  };
}

export function buildChapterPlan(
  bookId: string,
  chapter: ChapterLike,
  progress: ChapterProgress,
  inputs: ChapterPlanInputs
): ChapterStudyPlan {
  const block = buildChapterBlock(chapter, progress, inputs);

  return {
    id: `cp-${bookId}-${chapter.id}-${Date.now()}`,
    bookId,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    readPct: progress.readPct,
    understandPct: progress.understandPct,
    recallPct: progress.recallPct,
    masteryPct: progress.masteryPct,
    blocks: [block],
    createdAt: Date.now(),
  };
}

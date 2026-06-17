// lib/studyplan/buildUnitPlan.ts
// Unit Plan: a multi-chapter study plan (e.g. "Chapter 1-5") built from the
// same live chapter-progress data as the single-chapter plan, plus a
// trailing review block for chapters flagged weak/needs-review across the
// whole range. One daily block per chapter, in chapter order.

import { computeCourseProgress, type ChapterLike, type ChapterProgress } from "@/lib/syllabus/chapterProgress";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import { buildChapterBlock } from "./buildChapterPlan";
import type { StudyPlanAction, StudyPlanBlock, UnitStudyPlan } from "./types";

export interface UnitPlanInputs {
  visitedPages: Set<number>;
  notes: UltraNote[];
  recallSets: RecallSet[];
  studyGuides: StudyGuideRecord[];
}

export function buildUnitPlan(
  bookId: string,
  entries: Array<{ chapter: ChapterLike; progress: ChapterProgress }>,
  inputs: UnitPlanInputs
): UnitStudyPlan {
  const sorted = [...entries].sort(
    (a, b) => (a.chapter.pageRanges[0]?.start ?? 0) - (b.chapter.pageRanges[0]?.start ?? 0)
  );
  const chapters = sorted.map((e) => e.chapter);
  const progressList = sorted.map((e) => e.progress);
  const course = computeCourseProgress(chapters, progressList);

  const dailyBlocks: StudyPlanBlock[] = sorted.map(({ chapter, progress }, i) => {
    const block = buildChapterBlock(chapter, progress, inputs);
    return { ...block, id: `ub-${chapter.id}`, title: `Day ${i + 1} — ${chapter.title}` };
  });

  const weakChapters = sorted.filter(({ progress }) => progress.status === "weak_area" || progress.status === "needs_review");
  const reviewActions: StudyPlanAction[] = weakChapters.map(({ chapter }) => ({
    type: "practice",
    label: `Review weak chapter: "${chapter.title}"`,
  }));
  if (reviewActions.length === 0) {
    reviewActions.push({ type: "practice", label: "Run a mixed practice set across the whole unit" });
  }
  const reviewBlock: StudyPlanBlock = {
    id: `ub-review-${bookId}`,
    title: "Weekly Review",
    topic: "Unit Review",
    pages: [],
    actions: reviewActions,
    estimatedMinutes: 15 + weakChapters.length * 10,
  };

  const firstTitle = chapters[0]?.title ?? "Unit";
  const lastTitle = chapters[chapters.length - 1]?.title ?? firstTitle;
  const title = chapters.length > 1 ? `${firstTitle} → ${lastTitle}` : firstTitle;

  return {
    id: `up-${bookId}-${Date.now()}`,
    bookId,
    chapterIds: chapters.map((c) => c.id),
    title,
    unitReadPct: course.overallReadPct,
    unitUnderstandPct: course.overallUnderstandPct,
    unitRecallPct: course.overallRecallPct,
    unitMasteryPct: course.overallMasteryPct,
    blocks: [...dailyBlocks, reviewBlock],
    createdAt: Date.now(),
  };
}
